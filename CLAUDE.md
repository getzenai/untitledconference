# untitledconference

Conference programme management: call for proposals → review rounds → decisions → agenda →
public site. SvelteKit on Cloudflare Workers, Postgres via Drizzle, Better Auth.
The README covers what the product does, how to install it and how it deploys — read it once
instead of asking here.

## Where things are

The domain lives in `src/lib/conference/` (pure logic, unit-testable) and
`src/lib/server/conference/` (everything that touches the database). Screens are
`(public)/c/[slug]` for attendees, `(protected)/manage/[slug]` for organizers,
`(protected)/(with-sidebar)/portal` for speakers, `review/` for reviewers.

Area-specific conventions live in the CLAUDE.md closest to the code. Check that one before
assuming a rule from here applies:

| File                            | Covers                                                |
| ------------------------------- | ----------------------------------------------------- |
| `src/lib/server/CLAUDE.md`      | env access, logging, the two mail paths, ownership    |
| `src/lib/server/db/CLAUDE.md`   | Drizzle schema conventions, migrations, test utils    |
| `src/lib/server/jobs/CLAUDE.md` | pg-boss queue and the standalone worker               |
| `src/lib/components/CLAUDE.md`  | Svelte 5 runes, shadcn-svelte/bits-ui, forms, i18n    |
| `src/routes/api/v1/CLAUDE.md`   | API tiers and where auth is enforced                  |
| `cypress/CLAUDE.md`             | E2E structure, selectors, what bites                  |
| `ai-dev-docs/`                  | dense howtos: Better Auth, Superforms, Zod, redirects |

## Rules that are not obvious from the code

**Never read env at module scope.** `vite build` runs without secrets; a module-scope
`serverEnv()` aborts the build. Call it inside a function — see `src/lib/auth.ts`.

**A test file is collected only if its name matches.** `*.unit.test.ts` (no DB, everything
mocked) or `*.integration.test.ts` (real Postgres). A plain `*.test.ts` is silently skipped by
both Vitest projects. Tests sit next to the code they test.

**Routes are RESTful and stateless in the URL.** `/resource`, `/resource/new`, `/resource/[id]`.
Never show different content at the same URL depending on hidden state.

**Secrets come from the environment, never from the repo.** `.env` for local values, Infisical
for shared ones, `wrangler secret put` for production. `wrangler.jsonc` holds non-secret
configuration only, and its `vars` block ships to production verbatim.

**Migrations against production run only from `main`** (`scripts/db/migrate.mjs` guards this).

## Verification

The pre-commit hook runs format, lint, knip, `check` and `build`; pre-push runs unit tests
always and integration plus E2E when a test database is on :5433. CI runs the same set, so a
green pre-push is a good predictor of green CI.

Scale the effort to the risk of the change. A timing-out E2E test almost always means the
selector is wrong, not that the timeout is too short — never paper over it with `cy.wait(ms)`.

### Deep Review Verification

Every implementation plan includes `/deep-review` as a verification step, and it runs before
pushing: 3–5 agents per cycle from different perspectives (security, architecture, correctness,
performance, API), up to 3 cycles, stopping early when no critical or high findings remain.
CRITICAL and HIGH are always fixed; MEDIUM and LOW are judged in context.

## Svelte MCP server

`.mcp.json` wires the official server at `https://mcp.svelte.dev/mcp`; `.claude/settings.json`
also enables the `sveltejs/ai-tools` plugin, so a fresh clone has both without installing
anything. Use `list-sections` first, then `get-documentation` for what matches the task, and run
`svelte-autofixer` on Svelte code you write until it reports nothing. Skip `playground-link`:
work here is written to files. If the server is unreachable, fall back to
`https://svelte.dev/docs/svelte/llms-small.txt` and `.../kit/llms-small.txt`.
