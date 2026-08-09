/**
 * Applies committed Drizzle migrations to DATABASE_URL.
 *
 * Runs in two places, deliberately the same code path in both:
 *   - CI, against a throwaway Postgres, so a broken migration fails before merge
 *   - the deploy job, against Neon, immediately before `wrangler deploy`
 *
 * It does NOT run inside the Worker. A Cloudflare Worker has no startup hook and
 * no filesystem to read `drizzle/` from, so the container-entrypoint pattern used
 * elsewhere in the org cannot work here — the migration has to happen on a runner
 * before the new code goes live.
 *
 * Exits 0 on success including "nothing to migrate", 1 on failure — where
 * "success" now means every committed migration is recorded as applied, not just
 * that Drizzle returned without throwing. See `assertNothingSkipped`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[migrate] DATABASE_URL is not set');
	process.exit(1);
}

const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));

/**
 * Drizzle applies a migration only when its journal `when` is greater than the
 * LARGEST `created_at` already recorded — one comparison against one number, not
 * a per-migration check. So a single entry with a `when` above its successors
 * makes every one of them un-appliable, silently, with exit code 0.
 *
 * That is not hypothetical: `0001_documents_content_markdown` carried
 * `when: 1786320000000` — a hand-rounded timestamp a day in the future — which
 * swallowed `0005` on the production database while the deploy reported success.
 *
 * A journal out of order is always a bug, so it fails here, before anything runs.
 */
function assertJournalIsOrdered() {
	// Report the entry whose timestamp is too HIGH, not the one that trips over
	// it. In the failure this guard exists for, 0001 was the fake and 0002 was
	// merely its first victim — naming 0002 would send whoever is fixing it to a
	// perfectly healthy line.
	const breaks = journal.entries
		.map((entry, i, all) => ({ culprit: all[i - 1], victim: entry }))
		.filter(({ culprit, victim }) => culprit && victim.when <= culprit.when);

	if (breaks.length === 0) return;

	console.error('[migrate] Journal timestamps are not increasing:');
	for (const { culprit, victim } of breaks) {
		console.error(
			`[migrate]   ${culprit.tag} (when: ${culprit.when}) is not before ` +
				`${victim.tag} (when: ${victim.when}) — fix ${culprit.tag}`
		);
	}
	console.error(
		'[migrate] Drizzle compares each migration against the highest applied timestamp, ' +
			'so a migration after one of these would be skipped without an error. ' +
			'Fix the `when` values in drizzle/meta/_journal.json.'
	);
	process.exit(1);
}

/**
 * Verifies that every committed migration is recorded as applied.
 *
 * The migration-check job in CI cannot catch a skip, because it starts from an
 * empty database — with nothing recorded, Drizzle applies every entry regardless
 * of its timestamp. The skip only happens against a database with history, which
 * is to say: only in production. This assertion runs in both places and compares
 * what is on disk with what the database says it ran.
 */
async function assertNothingSkipped(client) {
	let applied;
	try {
		applied = await client`SELECT created_at FROM drizzle.__drizzle_migrations`;
	} catch (error) {
		// A missing table, a permission error and an unreachable database all end
		// up here and are three different problems. Swallowing the reason would
		// leave whoever hits this with a dead end instead of a next step.
		console.error(
			'[migrate] Could not read drizzle.__drizzle_migrations:',
			error instanceof Error ? error.message : error
		);
		if (error?.code) console.error('[migrate] sqlstate:', error.code);
		process.exit(1);
	}

	// Compared on `created_at` alone, not on the hash: this answers "did every
	// committed migration run", not "did the file change after it ran". The
	// second question is worth asking, and this is not the guard that asks it.
	const recorded = new Set(applied.map((row) => String(row.created_at)));
	const missing = journal.entries.filter((entry) => !recorded.has(String(entry.when)));
	if (missing.length === 0) {
		console.log(`[migrate] ${journal.entries.length} migrations applied`);
		return;
	}

	console.error('[migrate] Migrations were NOT applied and no error was raised:');
	for (const entry of missing) console.error(`[migrate]   ${entry.tag} (when: ${entry.when})`);
	process.exit(1);
}

assertJournalIsOrdered();

// `max: 1` because migrations must run on one connection, in order.
// `prepare: false` keeps this working through a transaction-pooling proxy.
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
	console.log('[migrate] Applying migrations …');
	await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
	await assertNothingSkipped(sql);
	console.log('[migrate] Done');
	await sql.end();
} catch (error) {
	console.error('[migrate] Failed:', error instanceof Error ? error.message : error);
	// The driver error carries the useful detail; Drizzle's wrapper does not.
	const cause = error?.cause;
	if (cause?.constraint_name) console.error('[migrate] constraint:', cause.constraint_name);
	if (cause?.code) console.error('[migrate] sqlstate:', cause.code);
	await sql.end({ timeout: 5 });
	process.exit(1);
}
