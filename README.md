# untitledconference

Run a conference programme from the open call to the published agenda — in one place, instead of a call-for-papers tool, a spreadsheet of reviews, a mail merge to speakers and a schedule someone maintains by hand.

Live: **[untitledconference.com](https://untitledconference.com)**

## Features

**Call for proposals.** A public CFP per conference with your own questions, including ones that only appear when an earlier answer calls for them. Speakers save drafts, add co-speakers, and edit until the call closes.

**Review.** Submissions go into review rounds. Reviewers can be scoped to a track, and a round is either open or blind until reviewed — in the second, you see the others' scores only after submitting your own, which is what keeps the first score posted from becoming everybody's prior. Decisions come out of the round, not out of someone's inbox.

**Speaker portal.** Accepted speakers get one page for their profile, headshot, files, deliverables and open tasks, and see what is still missing without being told.

**Agenda builder.** Accepted sessions are placed by drag and drop across rooms and time slots. The grid flags the conflicts you would otherwise find on the day: a speaker in two rooms at once, a room double-booked.

**Public programme.** Conference, speakers, agenda and gallery pages under `/c/<slug>`. Attendees build a personal itinerary and export it as `.ics`; the agenda is embeddable elsewhere with `?embed=1`.

**Email.** Speaker-workflow mail through [Resend](https://resend.com). Every message is a row in an outbox table that a dispatcher drains, so without an API key a local install sends nothing and loses nothing — the mail simply stays queued.

### Two interfaces most conference tools do not have

**An MCP server** at `/api/v1/mcp`, so you can run the conference by asking instead of clicking — "open the CFP and publish the page", "which proposals still have no review?", "put the accepted talks in the two big rooms and tell me what collides". The agent acts as you: it sees the conferences you can see, and can change only what you could change by hand.

Connect it to Claude Code with one line:

```bash
claude mcp add --transport http untitledconference https://untitledconference.com/api/v1/mcp
```

Then run `/mcp` and approve it in the browser — the server is its own OAuth 2.1 provider (discovery under `/.well-known`, PKCE, a consent screen, JWKS-verified tokens), so there is no key to paste anywhere and no token in a config file. Any MCP client that speaks streamable HTTP and OAuth connects the same way, by URL alone.

Thirty-one tools cover the three roles: an organizer runs the conference from the call to the placed agenda, a speaker submits and maintains proposals and their own profile, a reviewer works their assigned queue. What you can do is what the screens let you do — the tools call the same functions, refuse the same things, and a reviewer still cannot read a submission they were not assigned. [docs/MCP.md](docs/MCP.md) has the tool list and the details per role.

**A REST API** under `/api/v1`. The conference tools above are also resource routes (`GET /api/v1/conferences`, `POST /api/v1/conferences/{slug}/publish`, …) that call the same handlers as the MCP server, authenticated with the same OAuth bearer token. OpenAPI 3.1 is at `/api/v1/openapi.json`; a readable list is at `/api/v1/docs`. Directory still decides the other tiers: `public/` is open (`public/health` is the uptime probe), `protected/` requires a session and is rejected centrally before the handler runs, `test/` answers only where `ENABLE_TEST_ENDPOINTS=true`.

## Built with

[SvelteKit](https://svelte.dev/docs/kit) and Svelte 5 · TypeScript · Tailwind CSS with [shadcn-svelte](https://shadcn-svelte.com) · [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL · [Better Auth](https://www.better-auth.com) (organizations, passkeys, OAuth provider) · [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) for i18n · Vitest and [Cypress](https://www.cypress.io) · PostHog and OpenTelemetry, both optional and off unless configured.

In production it runs as a Cloudflare Worker: Neon Postgres reached through a Hyperdrive binding, uploads in R2, static assets on Cloudflare's edge.

## Installation

Requirements: Node.js 22+, Docker (for the local databases).

```bash
git clone https://github.com/getzenai/untitledconference.git
cd untitledconference
npm install

docker compose up -d          # dev database on :5432, test database on :5433
cp .env.example .env          # uncomment DATABASE_URL, TEST_DATABASE_URL, BETTER_AUTH_SECRET

npm run db:push               # create the schema
npm run dev                   # http://localhost:5173
```

Register the first account through the UI — it becomes the admin. `npm run db:push` and `npm run dev` read `.env` first and consult [Infisical](https://infisical.com) only for values still missing, so nothing here needs an Infisical account; it is how this project's own developers share their secrets, not a dependency of the app.

Optional, to look at a full conference rather than an empty one:

```bash
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/dev" \
  node scripts/db/seed-devflow.mjs
```

That writes a conference mid-review: thirty proposals across every status, two review rounds with scores from three reviewers, speaker tasks in every state, and sign-in credentials for an organizer, two speakers and three reviewers (see `DEMO_PASSWORD` in `scripts/db/seed-data.mjs`). It is idempotent — it drops the demo organization first.

For MCP tool work, a second tenant stays off the public site by remaining a draft:

```bash
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/dev" \
  node scripts/db/seed-mcp-harness.mjs
```

Own organisation, five accounts on `@mcpharness.example`, conference left as draft — `/c/mcp-harness` 404s and it does not appear on `/`. It does not touch DevFlow or the AI Engineer import.

## Usage

```bash
npm run dev              # dev server on :5173
npm run dev:cf           # the same app inside workerd, as it runs in production
npm run build            # production build
npm run preview          # serve that build locally

npm run check            # svelte-check and types
npm run lint             # Prettier and ESLint
npm run format           # write Prettier fixes

npm run test:unit        # no database needed
npm run test:integration # against a throwaway database on the :5433 server
npm run test:e2e         # Cypress, full browser journeys
npm run test             # all three, in that order

npm run db:push          # push the schema (development)
npm run db:generate      # write a migration from schema changes
npm run db:migrate       # apply migrations
npm run db:studio        # Drizzle Studio on :5555
```

Integration and E2E runs each create their own database on the test server and drop it afterwards, so parallel checkouts never share fixtures.

## Development

The product is one app. The engineering around it is what keeps that true as more than one person — or one agent — works on it at once. The commands are in [Usage](#usage); this is why they exist.

### Tests: unit, integration, end-to-end — all three, automatically

`npm test` is unit, then integration, then Cypress, in that order. CI runs the same three on every pull request. A change that only type-checks is not considered tested.

- **Unit** (`*.unit.test.ts`) — no database. Pure logic, mocked I/O.
- **Integration** (`*.integration.test.ts`) — real Postgres. `scripts/test/with-isolated-db.mjs` creates a throwaway database for the run and drops it afterwards, so two checkouts never share fixtures.
- **E2E** (`npm run test:e2e`) — full browser journeys against another isolated database.

A file named `*.test.ts` is silently not collected. The suffix is the contract, and tests sit next to the code they test.

### One migration script, the same in CI and in production

Locally, `npm run db:push` is enough. Anything that ships goes through a generated migration (`npm run db:generate`) applied by `scripts/db/migrate.mjs`. That is the same file CI runs against a fresh Postgres and the deploy job runs against Neon, immediately before `wrangler deploy`. It does not run inside the Worker — a Worker has no startup hook and no filesystem to read `drizzle/` from.

The script refuses to report success unless the database is actually current:

- Production runs must come from a clean `origin/main`. A stale branch can carry journal history that is absent from its own diff.
- Journal timestamps must increase. Drizzle compares each migration against the _highest_ applied timestamp, so one rounded `when` in the future silently swallows every successor and still exits 0.
- After applying, every committed migration must be recorded as applied. The skip above only happens against a database with history — which is to say, only in production — so CI on an empty database cannot catch it alone.

CI also fails if `drizzle-kit generate` would write anything: a schema change committed without its migration would otherwise deploy an app against a database that lacks its columns. The deploy job dumps the live database first. Drizzle is forward-only; the rollback is `psql < dump.sql`, not a down-migration.

### Auth is a folder, not a check you remember to copy

SvelteKit route groups draw the line once, so a new page inherits its access by living in the right directory:

| Group                        | Who gets in                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `(public)/`                  | anyone — login, register, the programme under `/c/<slug>`                                                                          |
| `(protected)/`               | a signed-in user. The group's `+layout.server.ts` redirects to `/login` if `locals.user` is missing. Pages inside do not re-check. |
| `(admin)/`                   | a platform admin. Same pattern, plus `locals.isAdmin`.                                                                             |
| `(protected)/manage/[slug]/` | an organizer of that conference. The slug layout calls `requireOrganizer` once for the whole tree.                                 |

A user who may not see the conference gets a 404, not a 403 — a 403 would confirm the slug exists.

MCP tools and the REST resource routes call the same `requireOrganizer` and `requireReviewer` (and the speaker-portal helpers). A reviewer still cannot read a submission they were not assigned, whether they came through the UI, an agent, or `curl`.

The same folder rule covers the other API tiers: `api/v1/public/` is open, `protected/` requires a session and is rejected before the handler runs, `test/` answers only where `ENABLE_TEST_ENDPOINTS=true`.

### CI is the gate; deploy is a consequence

`.github/workflows/lint_and_test.yaml` runs format, lint, types, a production build, unit, integration, E2E, and the migration check. Deploy (`deploy.yaml`) starts only after that workflow is green on `main` — never from a red tree, never from a pull request.

Credentials come from Infisical over GitHub OIDC, bound to `refs/heads/main`. There are no long-lived secrets in the repository. After `wrangler deploy` the job hits `/api/v1/public/health` until it is 200: a green deploy step alone does not prove the Worker can reach the database.

When `package-lock.json` changes, `npm audit signatures` runs as well.

A few other things that are easy to miss and expensive to rediscover:

- Environment variables are never read at module scope — `vite build` runs without secrets. Call `serverEnv()` inside a function.
- `.env` is local, Infisical is shared, `wrangler secret put` is production. `npm run dev` reads `.env` first.
- The commit hook is the same bar as CI minus the database jobs: format, lint, unused-export check (knip), `svelte-check`, a production build, and unit tests. Pre-push adds integration and E2E when a test database is on `:5433`.

## Deployment

The app targets Cloudflare Workers through `@sveltejs/adapter-cloudflare`. `wrangler.jsonc` declares the domain, the R2 bucket for speaker uploads and the Hyperdrive binding that pools Postgres connections at the edge; it carries only non-secret configuration.

```bash
npx wrangler r2 bucket create untitledconference-uploads
npx wrangler hyperdrive create untitledconference-db --connection-string "postgres://…"
# put the returned id into wrangler.jsonc, and point the domain at your own

npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY       # optional; without it, no mail is sent

npm run build && npx wrangler deploy
```

Use the Neon project's **direct** endpoint, not the `-pooler` host: Hyperdrive pools already. Migrations run separately with `npm run db:migrate` against the same database.

`.github/workflows/deploy.yaml` does all of this on every green `main`, and takes its credentials from Infisical over GitHub OIDC — there are no long-lived secrets in the repository.

Nothing in the app is Cloudflare-specific beyond the adapter and those two bindings: without a Hyperdrive binding the server falls back to `DATABASE_URL`, so any Node host with a Postgres database will also serve it.

## License

[MIT](LICENSE)
