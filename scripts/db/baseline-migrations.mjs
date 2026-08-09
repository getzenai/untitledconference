/**
 * One-time adoption of the drizzle migration chain on a database that was
 * originally provisioned with `drizzle-kit push`.
 *
 * `push` applies the schema directly and never writes to
 * `drizzle.__drizzle_migrations`, so `drizzle-kit migrate` on such a database
 * would try to replay the baseline migration and fail with 42P07
 * ("relation already exists"). This script records the baseline as applied —
 * using drizzle's own `readMigrationFiles` so the hash and timestamp are
 * exactly what the migrator would have written — after which `db:migrate`
 * applies only the migrations that come after it.
 *
 * Safe to re-run: it does nothing once any migration is recorded, and refuses
 * to run against a database that does not already have the baseline schema.
 *
 * Usage: npm run db:baseline
 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

const MIGRATIONS_FOLDER = 'drizzle';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';
// Present in the baseline migration; its existence is what distinguishes a
// push-provisioned database from an empty one.
const BASELINE_TABLE = 'user';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

// `CREATE ... IF NOT EXISTS` emits NOTICEs on re-runs; they are expected here.
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
	const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
	const baseline = migrations[0];
	if (!baseline) {
		console.error(`No migrations found in ./${MIGRATIONS_FOLDER}.`);
		process.exit(1);
	}

	await sql`CREATE SCHEMA IF NOT EXISTS ${sql(MIGRATIONS_SCHEMA)}`;
	await sql`
		CREATE TABLE IF NOT EXISTS ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`;

	const [{ count: recorded }] = await sql`
		SELECT count(*)::int AS count FROM ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)}
	`;
	if (recorded > 0) {
		console.log(`Migration history already present (${recorded} recorded). Nothing to do.`);
		process.exit(0);
	}

	const [{ exists: hasBaselineSchema }] = await sql`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = ${BASELINE_TABLE}
		) AS exists
	`;
	if (!hasBaselineSchema) {
		console.log(
			`Database has no "${BASELINE_TABLE}" table, so it is not a push-provisioned database. ` +
				'Run `npm run db:migrate` instead — it will apply the full chain.'
		);
		process.exit(0);
	}

	await sql`
		INSERT INTO ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)} ("hash", "created_at")
		VALUES (${baseline.hash}, ${baseline.folderMillis})
	`;

	console.log('Recorded the baseline migration as applied. Run `npm run db:migrate` next.');
} finally {
	await sql.end();
}
