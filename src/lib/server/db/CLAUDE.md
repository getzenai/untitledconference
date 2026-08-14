# Database Layer

## Schema files

Anything matching `./src/lib/server/db/**/**-schema.ts` is picked up by `drizzle.config.ts`
automatically — there is no allowlist to update.

- `auth-schema.ts` — Better Auth's own tables (`user`, `session`, `account`, `verification`,
  `organization`, `member`, `invitation`) plus `systemInvitation`. Treat the Better Auth tables as
  owned by the library: if a column is missing, check the plugin config in `$lib/auth.ts` before
  hand-editing this file.
- `conference/` — the product: `conference-schema.ts`, `cfp-schema.ts`, `review-schema.ts`,
  `program-schema.ts`, `content-schema.ts`, `email-schema.ts`.

A new schema module has to be spread into the `schema` object in **both** `db/index.ts` and
`db/test-utils.ts` if you want Drizzle's relational `db.query.*` API for it. Plain
`db.select().from(table)` works without that step, which is why a table can be missing from the
map and still be queried everywhere in the app — until someone reaches for `db.query`.

### Conventions

```typescript
export const myTable = pgTable('my_table', {
	id: serial('id').primaryKey(),

	// Foreign keys reference the exported table, with an explicit onDelete.
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),

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

Table and column names are `snake_case` in Postgres and `camelCase` in TypeScript. Ids are
`serial` in the conference schemas and text (cuid-style) in the Better Auth tables — match the
table you are extending. **Timestamp mode is not standardised**: the conference schemas use
`{ withTimezone: true }` with `.$onUpdate()`, `auth-schema.ts` uses a bare `timestamp()` with
`.$defaultFn()`. Read the neighbour rather than assuming a project-wide rule.

## The client (`db/index.ts`)

`db` is a lazy `Proxy`: the connection opens on first property access, not at import. That is
what lets `vite build` succeed with no `DATABASE_URL`, and it means importing `db` is always
safe — only touching it can throw.

In a Worker request the address comes from the Hyperdrive binding; without a binding it falls
back to `DATABASE_URL`. If a connection error surfaces during a build or a script that should
never need the database, something is touching `db` at module scope.

## Migrations

- `npm run db:push` (`db:push:force` to skip the prompt) pushes the schema straight to the dev
  database with no migration file. `db:push:test` does the same against `TEST_DATABASE_URL`.
- `npm run db:generate` writes a migration from the schema diff; add `-- --name <name>` to avoid
  a generated one. Commit the result under `drizzle/`.
- `npm run db:migrate` applies committed migrations. **Against production it runs only from
  `main`** — `scripts/db/migrate.mjs` refuses when HEAD is not `origin/main`.
- `npm run db:baseline` is the one-time step for a database that was built with `db:push`: it
  adopts the existing migrations so `db:migrate` does not try to replay the baseline.
- **Never hand-write a `when` in `drizzle/meta/_journal.json`.** Drizzle applies a migration only
  when its `when` is above the highest one already applied, so a made-up timestamp is a trap for
  every migration after it. `0019_lowercase_invitation_email` was written by hand with a `when` a
  day in the future (`1786780401577`) and production recorded it; until real time passes that
  value, a freshly generated migration sorts _below_ it and `scripts/db/migrate.mjs` stops the
  deploy. If the guard names 0019, bump your own entry above `1786780401577` — the recorded value
  on production cannot be taken back. A data-only migration still gets its `when` from
  `db:generate`: generate an empty one and replace the SQL.

## `test-utils.ts`

Helpers for `*.integration.test.ts`:

- `createTestDatabase(connectionId?)` — a dedicated connection against `TEST_DATABASE_URL`, keyed
  so different test files never share a pool. Throws if the variable is unset.
- `closeTestDatabase()` / `closeAllTestDatabases()` — call in `afterAll`, or connections leak
  between files.
- `cleanupTestDatabase()` — wipes data for isolation. Deletion order follows the foreign keys.
- `createTestUser`, `createTestOrganization`, `createTestMembership`, `seedTestData` and friends —
  look here before writing another factory.
