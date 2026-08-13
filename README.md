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

**An MCP server** at `/api/v1/mcp`, so an AI agent can work against your data with the same permissions as the person who authorised it. It speaks streamable HTTP and carries a full OAuth 2.1 provider — discovery under `/.well-known`, PKCE, a consent screen, JWKS-verified tokens — which means you connect Claude or any other MCP client by URL and approve it in the browser, with no key to paste anywhere. Tools today: `list_my_conferences`, `list_submissions`, `get_submission`, `get_agenda`, `decide_submissions`, plus `get_my_profile` and `list_my_organizations`. The conference tools go through the same `requireOrganizer` check the routes do, so an agent reaches exactly what its user reaches.

**A REST API** under `/api/v1`. Which directory an endpoint lives in decides its authentication: `public/` is open (`public/health` is the uptime probe), `protected/` requires a session and is rejected centrally before the handler runs, `test/` answers only where `ENABLE_TEST_ENDPOINTS=true`. Adding an endpoint to the right tier is the whole configuration.

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
