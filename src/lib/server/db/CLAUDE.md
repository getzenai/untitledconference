# Database Layer

## Schema Files

All schemas follow the `*-schema.ts` naming pattern and are picked up automatically by
`drizzle.config.ts` via:

```
schema: './src/lib/server/db/**/**-schema.ts'
```

Existing schema files:

- `auth-schema.ts` — Better Auth's own tables (`user`, `session`, `account`, `verification`,
  `organization`, `member`, `invitation`) plus one app-added table, `systemInvitation`. Treat the
  Better Auth tables as owned by the `better-auth` library — if a column is missing, check the
  Better Auth plugin config (`$lib/auth.ts`) before hand-editing this file.
- `documents-schema.ts` — the `documents` table (Tiptap JSON content, plain-text mirror for
  search/preview).
- `examples/crud-example-schema.ts` — `example_objects`, a minimal reference table backing the
  `/examples/crud` route. Useful as a template for a new feature schema.

### Creating a New Schema

1. Create `src/lib/server/db/your-feature-schema.ts` (or `db/your-feature/your-feature-schema.ts`
   for a multi-file feature, following the `examples/` layout).
2. `drizzle-kit` (via `drizzle.config.ts`'s glob) picks it up automatically for `db:push` and
   `drizzle-kit generate` — there is no `tablesFilter` allowlist to update in this repo.
3. If the table needs to be queryable via Drizzle's relational `db.query.*` API, spread the new
   schema module into the `schema: { ...authSchema, ...exampleSchema, ... }` object in both
   `db/index.ts` and `db/test-utils.ts`. Plain query-builder usage (`db.select().from(table)`,
   as `documents/operations.ts` does) works without this step — `documentsTable` itself is **not**
   currently registered in either schema map, which is fine as long as nothing needs
   `db.query.documents...`.

### Schema Conventions (observed, not all universal)

```typescript
import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { organization, user } from './auth-schema';

export const myTable = pgTable('my_table', {
	// Primary key: serial in both feature schemas today (documents, example_objects).
	// Better Auth's own tables use text ids (cuid-style) instead — match whichever
	// pattern the table you're extending already uses.
	id: serial('id').primaryKey(),

	// Foreign keys reference the *-schema.ts export directly, with explicit onDelete.
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	organizationId: text('organization_id').references(() => organization.id, {
		onDelete: 'cascade'
	}),

	// Timestamp mode is NOT standardized across schemas: documents-schema.ts and
	// crud-example-schema.ts use `{ withTimezone: true }` + `.$onUpdate()`, while
	// auth-schema.ts uses bare `timestamp()` with `.$defaultFn()`. Match the file you're
	// editing rather than assuming one project-wide rule.
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

// Always export both inferred types.
export type MyTable = typeof myTable.$inferSelect;
export type NewMyTable = typeof myTable.$inferInsert;
```

- Table names: `snake_case`. Column names: `snake_case` in Postgres, `camelCase` in TypeScript via
  Drizzle's mapping.
- Multi-tenant tables carry a nullable `organizationId` (documents can exist without an org) —
  check whether `organizationId` is required or optional for the feature you're building; don't
  assume every table enforces it the same way.

## Database Client (`db/index.ts`)

```typescript
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(target, prop, receiver) {
		if (!_db) {
			client = postgres(config.databaseUrl);
			_db = drizzle(client, { schema: { ...authSchema, ...exampleSchema } });
		}
		return Reflect.get(_db, prop, receiver);
	}
});
```

- Lazy singleton via `Proxy` — the Postgres connection is only opened on first property access,
  not at import time. This is what lets `vite build` succeed without `DATABASE_URL` set.
- `config.databaseUrl` (see `../CLAUDE.md`) throws if `DATABASE_URL` is missing, but only when the
  `db` Proxy is actually touched — importing `db` is always safe.

## Migrations

- **Local dev**: `npm run db:push` (or `db:push:force` to skip the confirmation prompt) pushes the
  current schema straight to the dev database — no migration files. `db:push:test` does the same
  against `TEST_DATABASE_URL`.
- There is currently **no `db:generate` npm script**. The repo ships a single squashed migration
  (`drizzle/0000_merged_initial_schema.sql`). If you need to produce a new migration file, run
  `npx drizzle-kit generate` directly (optionally `-- --name <descriptive-name>` to avoid an
  auto-generated name) and commit the result under `drizzle/`.
- `npm run db:migrate` runs `drizzle-kit migrate` to apply committed migration files.
- `npm run db:studio` opens Drizzle Studio against whichever `DATABASE_URL` is active.

## `test-utils.ts`

Test-only database helpers used by integration tests (`*.integration.test.ts`):

- `createTestDatabase(connectionId?)` — opens (or reuses) a dedicated Postgres connection against
  `TEST_DATABASE_URL`, keyed by `connectionId` so different test files don't share a connection
  pool. Throws if `TEST_DATABASE_URL` is unset.
- `closeTestDatabase(connectionId?)` / `closeAllTestDatabases()` — call in `afterAll`/`afterEach` to
  avoid leaking connections between test files.
- `cleanupTestDatabase(connectionId?)` — wipes test data for isolation between test runs.
- Also exports `createTestUser`, `createTestOrganization`, `createTestMembership`, and similar
  factory helpers used across integration tests — check here before writing a new one.

## Common Pitfalls

1. **Forgetting to spread a new schema** into `db/index.ts` / `db/test-utils.ts` if you need
   `db.query.*` for it — plain `db.select().from(table)` doesn't need this, but it's easy to add
   the relational query later and wonder why the table isn't there.
2. **Assuming a project-wide timestamp mode** — check the neighboring table, don't copy blindly
   from a different schema file.
3. **`config.databaseUrl` throwing unexpectedly** — this only happens on first real query; if it
   throws during a build or a script that shouldn't need the DB, something is eagerly accessing
   `db` (or `config`) at module scope instead of inside a function.
