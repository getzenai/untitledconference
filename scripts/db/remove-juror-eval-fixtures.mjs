/**
 * Takes the MCP juror-eval residue out of the DevFlow demo (issue #619).
 *
 * Harness runs that exercised the reviewer tools submitted into the DevFlow
 * demo conference and left four rows behind — `Juror eval talk <epoch ms>`,
 * speaker "Grok Juror", rejected, no reviews, no track, unscheduled. The
 * submissions table sorts newest first, so they are the first four rows an
 * organizer (or a judge on the demo) sees. Nothing in the product deletes a
 * submission: an organizer can decide it, a speaker can withdraw it, and both
 * leave the row in the table. Hence a script.
 *
 * The separate `grok-juror-*` conference is not touched here. It came off the
 * front page through the admin page built for exactly that (#426), which is
 * where that decision belongs.
 *
 * Scoped three ways, because "delete" deserves it: the DevFlow conference by
 * slug, the title pattern, and — as the check that a mistyped pattern cannot
 * survive — the primary speaker's name. A row failing any of the three is
 * reported and left alone.
 *
 * Everything that hangs off a submission cascades (`submission_speaker`,
 * `review`, `submission_answer`, `deliverable`, `placement`, carry-forward),
 * so the delete is one statement. The `speaker_profile` rows do not: they are
 * organization-scoped and would stay in DevFlow's speaker directory with no
 * talk attached, so a profile is removed after — but only the profiles that
 * hung on exactly these submissions, and only if the delete left them with no
 * talk at all. A same-named profile this script never touched stays.
 *
 * Read, classify and both deletes share one transaction: if the profile delete
 * fails after the submissions are gone, a retry would find no candidate left,
 * return early, and strand the profiles forever.
 *
 * Idempotent: a second run finds nothing and says so.
 *
 *   DATABASE_URL=postgres://… node scripts/db/remove-juror-eval-fixtures.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/remove-juror-eval-fixtures.mjs
 *
 * Runs against prod via run-db-script.yaml from main, `--dry-run` first.
 */
import postgres from 'postgres';

const CONFERENCE_SLUG = 'devflow-conf-2027';
/** `Juror eval talk 1786581136796` — the harness stamps the epoch in ms. */
const TITLE_PATTERN = '^Juror eval talk [0-9]+$';
const SPEAKER_NAME = 'Grok Juror';

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[remove-juror-eval-fixtures] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const log = (message) => console.log(`[remove-juror-eval-fixtures] ${message}`);

/**
 * Every row in this conference whose title looks like a juror eval fixture.
 *
 * The speaker name is aggregated rather than joined into the WHERE clause so
 * that a row matching the title but carrying somebody else's name shows up in
 * the log instead of being silently skipped.
 */
function findCandidates(sql) {
	return sql`
		SELECT s.id, s.title, s.status,
			coalesce(array_agg(DISTINCT sp.name) FILTER (WHERE sp.name IS NOT NULL), '{}') AS speakers,
			coalesce(array_agg(DISTINCT sp.id) FILTER (WHERE sp.id IS NOT NULL), '{}') AS speaker_ids,
			count(DISTINCT r.id) AS reviews
		FROM submission s
		JOIN conference c ON c.id = s.conference_id
		LEFT JOIN submission_speaker ss ON ss.submission_id = s.id
		LEFT JOIN speaker_profile sp ON sp.id = ss.speaker_profile_id
		LEFT JOIN review r ON r.submission_id = s.id
		WHERE c.slug = ${CONFERENCE_SLUG} AND s.title ~ ${TITLE_PATTERN}
		GROUP BY s.id, s.title, s.status
		ORDER BY s.id
	`;
}

/**
 * Logs every candidate and returns the submission ids that pass the speaker
 * check, plus the profile ids those submissions hang on — nothing else is a
 * deletion candidate later.
 */
function classify(candidates) {
	const doomed = [];
	const profileIds = new Set();
	for (const row of candidates) {
		const onlyJuror = row.speakers.length > 0 && row.speakers.every((n) => n === SPEAKER_NAME);
		const detail = `#${row.id} "${row.title}" [${row.status}] speakers=${row.speakers.join(', ') || 'none'} reviews=${row.reviews}`;
		if (onlyJuror) {
			doomed.push(row.id);
			for (const id of row.speaker_ids) profileIds.add(id);
			log(`  remove ${detail}`);
		} else {
			log(`  KEEP   ${detail} — not a "${SPEAKER_NAME}" fixture`);
		}
	}
	return { doomed, profileIds: [...profileIds] };
}

async function main() {
	log(`${dryRun ? 'DRY RUN — ' : ''}conference '${CONFERENCE_SLUG}'`);

	// Read, classify and both deletes in one transaction: a half-applied run
	// would leave no candidate for the retry to find and strand the profiles.
	await sql.begin(async (tx) => {
		const candidates = await findCandidates(tx);
		if (candidates.length === 0) {
			log('nothing to remove — no juror eval submission in this conference');
			return;
		}

		const { doomed, profileIds } = classify(candidates);
		if (doomed.length === 0) {
			log('nothing matched all three conditions; no row deleted');
			return;
		}

		if (dryRun) {
			log(
				`done (dry-run): would delete ${doomed.length} submission(s) and up to ${profileIds.length} profile(s) left orphaned`
			);
			return;
		}

		const deleted = await tx`
			DELETE FROM submission WHERE id IN ${tx(doomed)} RETURNING id
		`;

		// Only the profiles that hung on exactly the submissions we just deleted,
		// and only those the delete left with no talk at all. Asked after the
		// delete, so "orphaned" is about the state it leaves behind. A same-named
		// profile this run never touched stays.
		const profiles = profileIds.length
			? await tx`
					DELETE FROM speaker_profile sp
					WHERE sp.id IN ${tx(profileIds)}
						AND NOT EXISTS (SELECT 1 FROM submission_speaker ss WHERE ss.speaker_profile_id = sp.id)
					RETURNING sp.id
				`
			: [];

		log(
			`done: ${deleted.length} submission(s) deleted, ${profiles.length} orphaned "${SPEAKER_NAME}" profile(s) removed`
		);
	});
}

main()
	.catch((err) => {
		console.error('[remove-juror-eval-fixtures] failed:', err);
		process.exitCode = 1;
	})
	.finally(() => sql.end({ timeout: 5 }));
