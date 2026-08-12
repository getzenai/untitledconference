# Repository Guidelines

`CLAUDE.md` in the repository root is the single source for conventions, and each area has its
own `CLAUDE.md` next to the code (`src/lib/server/`, `src/lib/server/db/`,
`src/lib/components/`, `src/routes/api/v1/`, `cypress/`). Read the closest one to what you are
editing. This file is the short version for agents that do not load those automatically.

## Structure

- `src/routes` — SvelteKit pages and endpoints, RESTful (`/resource`, `/resource/new`,
  `/resource/[id]`).
- `src/lib/conference` — domain logic with no database; `src/lib/server/conference` — the same
  domain where it touches Postgres.
- `src/lib/components` — shared components; shadcn-svelte primitives in `components/ui`.
- `drizzle/` — generated migrations; `cypress/` — E2E specs and page objects; `scripts/` — dev,
  database and deployment scripts.

## Commands

```bash
npm run dev              # dev server on :5173
npm run check            # svelte-check and types
npm run lint             # Prettier check and ESLint
npm run test:unit        # no database needed
npm run test:integration # needs the test database on :5433
npm run test:e2e         # Cypress
npm run db:push          # push schema in development
```

## Style

- Prettier and ESLint decide formatting; do not hand-format.
- Svelte components are PascalCase, everything else kebab-case, exports camelCase.
- Match the file you are editing. Do not add comments that restate the code.
- Tests are co-located and must be named `*.unit.test.ts` or `*.integration.test.ts` — any other
  name is silently not run.

## Rules with teeth

- Never read environment variables at module scope: `vite build` runs without secrets. Use
  `serverEnv()` inside a function.
- Never commit a secret. `.env` is local, Infisical is shared, `wrangler secret put` is
  production.
- Every mutation re-checks ownership in its own query; there is no authorization layer that
  would catch a missed check.
- Production migrations run only from `main` — `scripts/db/migrate.mjs` refuses otherwise.

## Pull requests

Imperative subject, ≤72 characters. Describe what changed and what you ran to verify it, link
the issue (`Closes #123`), and attach evidence for anything user-visible.
