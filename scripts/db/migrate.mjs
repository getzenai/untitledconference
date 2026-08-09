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
 * Exits 0 on success including "nothing to migrate", 1 on failure.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('[migrate] DATABASE_URL is not set');
	process.exit(1);
}

// `max: 1` because migrations must run on one connection, in order.
// `prepare: false` keeps this working through a transaction-pooling proxy.
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
	console.log('[migrate] Applying migrations …');
	await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
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
