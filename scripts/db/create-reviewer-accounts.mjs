/**
 * The judges' accounts for the Kill My SaaS hackathon review.
 *
 * The submission form asks for a login rather than a signup, so the AI Engineer
 * reviewers get ready-made accounts that reach the organizer side of every
 * conference on the demo instance.
 *
 * **Per-conference `membership` rows, not an org-wide seat.** `requireOrganizer`
 * (`src/lib/server/conference/access.ts`) grants organizer rights either from an
 * org-wide `owner`/`admin` seat or from a `membership` scoped to one conference.
 * Only the second is used here: an org-wide admin seat would also carry
 * organization settings, billing and the member list — rights a visiting reviewer
 * has no business with — and it would not reach the AI Engineer import, which
 * lives in a different organization. Scoped rows say exactly what was granted.
 *
 * The `member` seat in the DevFlow organization is separate and deliberate: sign-in
 * puts the user's first organization on the session (`auth.ts`, session.create),
 * and a user in no organization is the state several callers mishandle. One seat,
 * at the plain `member` role, which grants nothing on its own.
 *
 * Idempotent, keyed on the email address: re-running refreshes the password hash
 * and adds only the rows that are missing. It touches no row belonging to anyone
 * else — every statement is filtered by these four addresses.
 *
 *   DATABASE_URL=postgres://… node scripts/db/create-reviewer-accounts.mjs --dry-run
 *   DATABASE_URL=postgres://… node scripts/db/create-reviewer-accounts.mjs
 *
 * Runs against prod via run-db-script.yaml from main, `--dry-run` first.
 */
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';
import { DEMO_PASSWORD } from './seed-data.mjs';

/**
 * The four addresses swyx named in the Discord announcement. `id` is stable and
 * readable so that a later cleanup is a one-line `DELETE ... WHERE id LIKE
 * 'user-aie-%'`, and so that a re-run recognises its own rows.
 */
const REVIEWERS = [
	{ id: 'user-aie-swyx', name: 'swyx', email: 'swyx@ai.engineer' },
	{ id: 'user-aie-sydney', name: 'Sydney', email: 'sydney@ai.engineer' },
	{ id: 'user-aie-phlo', name: 'phlo', email: 'phlo@ai.engineer' },
	{ id: 'user-aie-kelsey', name: 'Kelsey', email: 'kelsey@ai.engineer' }
];

/** The organization whose seat lands on the session at sign-in. */
const HOME_ORG_ID = 'org-devflow';

/**
 * Every conference on the instance: the demo tenant that carries the workflow,
 * and the three imported AI Engineer programmes, which are theirs.
 *
 * A slug that is missing from the database is reported and skipped rather than
 * failing the run — the AI Engineer import is additive and may not be present on
 * every environment this is run against.
 */
const CONFERENCE_SLUGS = [
	'devflow-conf-2027',
	'ai-engineer-worlds-fair-2025',
	'ai-engineer-summit-2025',
	'kill-my-saas-1-2026'
];

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[create-reviewer-accounts] DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const log = (...args) => console.log('[create-reviewer-accounts]', ...args);

async function main() {
	log(`${dryRun ? 'DRY RUN — ' : ''}${REVIEWERS.length} reviewer accounts`);

	const [org] = await sql`SELECT id FROM organization WHERE id = ${HOME_ORG_ID}`;
	if (!org) {
		console.error(
			`[create-reviewer-accounts] organization '${HOME_ORG_ID}' is missing — seed it first`
		);
		process.exit(1);
	}

	const conferences = await sql`
		SELECT id, slug, name FROM conference WHERE slug IN ${sql(CONFERENCE_SLUGS)}
	`;
	for (const slug of CONFERENCE_SLUGS) {
		if (!conferences.some((c) => c.slug === slug)) log(`  ! no conference '${slug}' — skipped`);
	}
	log(`granting organizer on: ${conferences.map((c) => c.slug).join(', ')}`);

	const password = await hashPassword(DEMO_PASSWORD);

	for (const reviewer of REVIEWERS) {
		const [existing] = await sql`SELECT id FROM "user" WHERE email = ${reviewer.email}`;
		const userId = existing?.id ?? reviewer.id;
		const verb = existing ? 'update' : 'create';
		log(`${reviewer.email} — ${verb} (${userId})`);

		if (dryRun) continue;

		if (existing) {
			await sql`UPDATE "user" SET name = ${reviewer.name}, email_verified = true, updated_at = now() WHERE id = ${userId}`;
		} else {
			await sql`INSERT INTO "user" ${sql({
				id: userId,
				name: reviewer.name,
				email: reviewer.email,
				email_verified: true,
				role: 'user',
				created_at: new Date(),
				updated_at: new Date()
			})}`;
		}

		// Better Auth keeps password hashes in `account`, one row per credential
		// provider; `hashPassword` is its own scrypt and the app configures no custom
		// hasher, so this verifies through the ordinary login form.
		const [credential] = await sql`
			SELECT id FROM account WHERE user_id = ${userId} AND provider_id = 'credential'
		`;
		if (credential) {
			await sql`UPDATE account SET password = ${password}, updated_at = now() WHERE id = ${credential.id}`;
		} else {
			await sql`INSERT INTO account ${sql({
				id: `account-${userId}`,
				account_id: userId,
				provider_id: 'credential',
				user_id: userId,
				password,
				created_at: new Date(),
				updated_at: new Date()
			})}`;
		}

		const [seat] = await sql`
			SELECT id FROM member WHERE user_id = ${userId} AND organization_id = ${HOME_ORG_ID}
		`;
		if (!seat) {
			await sql`INSERT INTO member ${sql({
				id: `member-${userId}`,
				organization_id: HOME_ORG_ID,
				user_id: userId,
				role: 'member',
				created_at: new Date()
			})}`;
		}

		for (const conference of conferences) {
			const [membership] = await sql`
				SELECT id FROM membership
				WHERE user_id = ${userId} AND role = 'organizer'
					AND scope_type = 'conference' AND scope_id = ${conference.id}
			`;
			if (membership) continue;
			await sql`INSERT INTO membership ${sql({
				user_id: userId,
				role: 'organizer',
				scope_type: 'conference',
				scope_id: conference.id,
				created_at: new Date()
			})}`;
		}
	}

	const emails = REVIEWERS.map((r) => r.email);
	const [summary] = await sql`
		SELECT
			(SELECT count(*) FROM "user" WHERE email IN ${sql(emails)}) AS users,
			(SELECT count(*) FROM account a JOIN "user" u ON u.id = a.user_id
				WHERE u.email IN ${sql(emails)} AND a.provider_id = 'credential' AND a.password IS NOT NULL) AS credentials,
			(SELECT count(*) FROM member m JOIN "user" u ON u.id = m.user_id
				WHERE u.email IN ${sql(emails)}) AS seats,
			(SELECT count(*) FROM membership ms JOIN "user" u ON u.id = ms.user_id
				WHERE u.email IN ${sql(emails)} AND ms.role = 'organizer') AS organizer_memberships
	`;
	log(
		`now in the database: ${summary.users} users, ${summary.credentials} credentials, ` +
			`${summary.seats} org seats, ${summary.organizer_memberships} organizer memberships ` +
			`(expected ${REVIEWERS.length}, ${REVIEWERS.length}, ${REVIEWERS.length}, ` +
			`${REVIEWERS.length * conferences.length})`
	);
	if (dryRun) log('DRY RUN — nothing was written.');
	else log(`Password for all of them: ${DEMO_PASSWORD}`);
}

main()
	.catch((error) => {
		console.error('[create-reviewer-accounts]', error);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
