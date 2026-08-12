/**
 * Merges `speaker_profile` rows that are the same person recorded twice, inside
 * the AI Engineer import organization (issue #20 stage 2).
 *
 * Why they exist: `seed-ai-engineer.mjs` used to dedupe speakers per conference
 * rather than per organization, so anybody who spoke at both the World's Fair and
 * the Summit got two profiles. The seed itself is fixed in the same change; this
 * script repairs the rows already in a database that was seeded before the fix.
 *
 * Why it matters beyond tidiness: `speaker_profile` is the org-global identity
 * that the public profile page's cross-event talk history and the `/contacts`
 * directory both join through. Split in two, a speaker's history reads as empty
 * and the directory lists the same person twice.
 *
 * Scoped to `org-ai-engineer-import` deliberately. Two profiles with the same name
 * in a customer's organization may well be two people; that is a judgement call
 * for a human, not for a batch job. Here the duplicates have a known cause.
 *
 * Idempotent: it merges by (organization_id, name) and keeps the lowest id, so a
 * second run finds no group with more than one row and changes nothing.
 *
 *   DATABASE_URL=postgres://… node scripts/db/merge-duplicate-speaker-profiles.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/merge-duplicate-speaker-profiles.mjs
 */
import postgres from 'postgres';

const TAG = '[merge-duplicate-speaker-profiles]';
const ORG_ID = 'org-ai-engineer-import';

/** Columns worth rescuing from a duplicate when the survivor never got them. */
const FILLABLE = ['email', 'headshot_url', 'job_title', 'company', 'bio', 'links', 'notes', 'tags'];

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(`${TAG} DATABASE_URL is required`);
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

/**
 * Repoints one child table from `duplicateId` to `survivorId`.
 *
 * `submission_speaker` and `conference_speaker` both carry a unique index that the
 * survivor may already satisfy — the same person credited on one submission under
 * both profiles. Moving such a row would violate the index, so it is dropped
 * instead: the survivor already holds the link the row was expressing.
 */
async function repoint(table, scopeColumn, survivorId, duplicateId) {
	const moved = await sql`
		UPDATE ${sql(table)} AS child
		SET speaker_profile_id = ${survivorId}
		WHERE child.speaker_profile_id = ${duplicateId}
		  AND NOT EXISTS (
			SELECT 1 FROM ${sql(table)} AS kept
			WHERE kept.speaker_profile_id = ${survivorId}
			  AND kept.${sql(scopeColumn)} = child.${sql(scopeColumn)}
		)
		RETURNING child.id
	`;
	const dropped = await sql`
		DELETE FROM ${sql(table)}
		WHERE speaker_profile_id = ${duplicateId}
		RETURNING id
	`;
	return { moved: moved.length, dropped: dropped.length };
}

async function mergeInto(survivor, duplicate) {
	const fills = {};
	for (const column of FILLABLE) {
		if (survivor[column] === null && duplicate[column] !== null) fills[column] = duplicate[column];
	}

	console.log(
		`${TAG} "${survivor.name}": #${duplicate.id} → #${survivor.id}` +
			(Object.keys(fills).length ? ` (fills ${Object.keys(fills).join(', ')})` : '')
	);

	if (dryRun) return;

	if (Object.keys(fills).length) {
		await sql`UPDATE speaker_profile SET ${sql(fills)}, updated_at = now() WHERE id = ${survivor.id}`;
		Object.assign(survivor, fills);
	}

	const submissions = await repoint(
		'submission_speaker',
		'submission_id',
		survivor.id,
		duplicate.id
	);
	const rosters = await repoint('conference_speaker', 'conference_id', survivor.id, duplicate.id);
	// `task` has no uniqueness to respect: two open tasks for the same person are
	// two tasks, not a conflict.
	const tasks = await sql`
		UPDATE task SET speaker_profile_id = ${survivor.id}
		WHERE speaker_profile_id = ${duplicate.id}
		RETURNING id
	`;

	await sql`DELETE FROM speaker_profile WHERE id = ${duplicate.id}`;

	console.log(
		`${TAG}   moved ${submissions.moved} submission link(s), ${rosters.moved} roster row(s), ` +
			`${tasks.length} task(s); dropped ${submissions.dropped + rosters.dropped} redundant link(s)`
	);
}

async function main() {
	console.log(`${TAG} ${dryRun ? 'DRY RUN — ' : ''}starting on ${ORG_ID}`);

	const profiles = await sql`
		SELECT * FROM speaker_profile
		WHERE organization_id = ${ORG_ID}
		ORDER BY name, id
	`;

	const byName = new Map();
	for (const profile of profiles) {
		byName.set(profile.name, [...(byName.get(profile.name) ?? []), profile]);
	}

	let groups = 0;
	let merged = 0;
	for (const rows of byName.values()) {
		if (rows.length < 2) continue;
		groups += 1;
		// Lowest id wins: it is the profile the earliest conference already links to,
		// so the fewest rows have to move.
		const [survivor, ...duplicates] = rows;
		for (const duplicate of duplicates) {
			await mergeInto(survivor, duplicate);
			merged += 1;
		}
	}

	console.log(
		`${TAG} done: ${groups} duplicated name(s), ${merged} profile(s) merged` +
			(dryRun ? ' (dry-run)' : '')
	);
}

main()
	.catch((err) => {
		console.error(`${TAG} failed:`, err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
