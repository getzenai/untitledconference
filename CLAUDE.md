# Claude Code Instructions

## Project Overview

SvelteKit starter with PostgreSQL, Drizzle ORM, Better Auth, and comprehensive tooling.

**Credential rule**: All credentials (API keys, auth secrets) ALWAYS come from Infisical Cloud. Only local Docker DB connection strings may live in `.env`. Exception: test/CI environments use hardcoded test secrets when Infisical is not available.

See `docs/software-factory.md` for the full inventory of agent automation mechanisms.

## Routing: RESTful Pattern

- `/resource` - List/redirect
- `/resource/new` - Create form
- `/resource/[id]` - View/edit item
  Never show different content at same URL based on state.

## Development Modes

Two first-class modes, both requiring `infisical login` for Infisical Cloud access:

### Cloud DB mode (default — no .env needed)

```bash
infisical login   # one-time Infisical auth
npm run dev       # fetches all secrets from Infisical, starts dev server
```

- DATABASE_URL from Infisical
- TEST_DATABASE_URL from Infisical
- All other secrets from Infisical

### Local Docker mode (.env with DB URLs only)

```bash
infisical login           # one-time Infisical auth
docker compose up -d      # start dev-db (port 5432) + test-db (port 5433)
cp .env.example .env      # uncomment DATABASE_URL and TEST_DATABASE_URL
npm run dev               # .env DB URLs used, rest from Infisical
```

- DATABASE_URL from .env (local Docker on port 5432)
- TEST_DATABASE_URL from .env (local Docker on port 5433)
- All other secrets (BETTER_AUTH_SECRET, GitHub, SendGrid, OpenAI) from Infisical

### How it works

`npm run dev` calls `dev-from-infisical.sh` which:

1. Sources `.env` if present (picks up local DB URLs)
2. Fetches all secrets from Infisical via `infisical export`; skips if env var is already set
3. Derives feature flags from available secrets
4. Runs the dev server

## Database Commands

```bash
npm run db:push          # Push schema to dev database
npm run db:push:force    # Push schema (force, no confirmation)
npm run db:push:test     # Push schema to test database
npm run db:studio        # Open Drizzle Studio
npm run db:migrate       # Run migrations
```

All database commands go through `dev-from-infisical.sh` — credentials are available in both modes.

## Testing Conventions

Vitest is configured with two **projects** (`vitest.config.ts`), selected by filename suffix —
there is no separate config file per test type, just a glob per project:

| Project       | File pattern                   | Environment | DB / network                                                                                               |
| ------------- | ------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `unit`        | `src/**/*.unit.test.ts`        | node        | None — no `globalSetup`, everything mocked                                                                 |
| `integration` | `src/**/*.integration.test.ts` | node        | Real Postgres via `TEST_DATABASE_URL`, `globalSetup`/`setupFiles` wire it up, `ENABLE_TEST_ENDPOINTS=true` |

Both kinds of test are **co-located with the code they test** (e.g.
`src/routes/api/v1/public/health/server.integration.test.ts` next to that route's `+server.ts`,
`src/routes/(protected)/(with-sidebar)/examples/crud/crud.unit.test.ts` next to the CRUD example
route). There is no separate `tests/` or `__tests__/` tree for unit/integration coverage.

A test file only gets collected if its name matches one of the two globs above exactly — a stray
`*.test.ts` file (missing the `.unit.` or `.integration.` infix) is silently skipped by both
projects, so double-check the filename when adding a new test.

**What belongs where:**

- **Unit** — pure logic with no I/O: validation helpers, request-routing/auth logic with `auth`,
  the logger, and SvelteKit hooks mocked out (see `src/routes/api/v1/api-routing-*.unit.test.ts`
  for the pattern used to test `hooks.server.ts` itself), component/module-level logic that doesn't
  touch the database.
- **Integration** — anything that needs a real database: server actions, `db/` operations, API
  route handlers exercised end-to-end at the function level (calling the exported `GET`/`POST`
  directly, not over HTTP).
- **E2E** — full browser flows through critical user journeys (login, registration, core CRUD).
  These live in the top-level `e2e/` directory; see `e2e/CLAUDE.md` for the current framework and
  patterns in that directory, since it may not match whatever is described further down in this
  file if that suite is mid-migration.

**How to run each:**

```bash
npm run test:unit          # vitest --project unit — no DB needed
npm run test:integration   # vitest --project integration — needs TEST_DATABASE_URL (docker compose up -d gives one on :5433)
npm run test:e2e           # full E2E suite — see e2e/CLAUDE.md
npm run test               # unit, then integration, then e2e, in that order
npm run test:all           # ./scripts/test-all.sh — the comprehensive local runner
```

## Testing Commands

```bash
npm run test              # All tests
npm run test:e2e          # E2E tests only (Cypress, headless)
npm run test:e2e:open     # Interactive Cypress runner
npm run test:e2e:spec -- cypress/e2e/critical-paths/login-workflow.cy.ts  # One spec
npm run lint              # Check code quality
npm run format            # Format code
```

`npm run test:e2e` runs `scripts/run-e2e.sh`: push schema to `TEST_DATABASE_URL`,
build, start `vite preview` on port 5174, run Cypress. Set `SKIP_BUILD=true` to
reuse an existing build. No Infisical secrets are needed for E2E.

### E2E Test Debugging

1. Run the single failing spec: `npm run test:e2e:spec -- cypress/e2e/.../thing.cy.ts`
2. Failure screenshots land in `cypress/screenshots/` (gitignored)
3. Create a todo per failing test, mark complete only after a passing run
4. A timeout almost always means the selector is wrong - fix the selector, not the timeout

### E2E Timeouts (cypress.config.ts)

- `defaultCommandTimeout`: 8000ms - Cypress retries a command until it passes,
  so this is the budget for "the element appears", not for a single attempt
- `pageLoadTimeout`: 60000ms
- `requestTimeout`: 10000ms / `responseTimeout`: 30000ms

Never add `cy.wait(ms)` to UI operations. Cypress retries assertions.

### Page Object Model

Tests use the POM pattern. See `/cypress/CLAUDE.md` for details.

- Pages in `/cypress/support/pages/`
- Actions in `/cypress/support/actions/`
- Specs in `/cypress/e2e/critical-paths/` and `/cypress/e2e/unauthenticated/`

## Development

See "Development Modes" above for setup.

```bash
npm run build  # Build for production (no secrets needed — lazy Proxy pattern)
```

## Git Hooks & CI Parity

The pre-commit hook (`.husky/pre-commit`) and pre-push hook (`.husky/pre-push`) mirror the GitHub CI pipeline so errors are caught locally:

| Check                  | Pre-commit     | Pre-push      | CI             | Notes                                       |
| ---------------------- | -------------- | ------------- | -------------- | ------------------------------------------- |
| `npm run format`       | Yes (auto-fix) | -             | `format:check` | Pre-commit writes fixes, CI only checks     |
| `npm run lint`         | Yes            | -             | Yes            | Prettier + ESLint (max 60 warnings)         |
| `npm run check:unused` | Yes            | -             | -              | Knip dead code detection (local-only extra) |
| `npm run check`        | Yes            | -             | Yes            | Paraglide compile + svelte-check types      |
| `npm run build`        | Yes            | -             | Yes            | Catches build-time errors (e.g. lazy init)  |
| `npm run test:unit`    | Yes            | Yes           | Yes            | Unit tests (no DB needed)                   |
| `test:integration`     | -              | If DB on 5433 | Yes            | Needs running database                      |
| `test:e2e`             | -              | If DB on 5433 | Yes            | Needs DB + Cypress binary                   |

**Important**: Server-side code must not eagerly evaluate env vars at module scope — `vite build` runs without `.env`. Use lazy patterns (Proxy, getter functions) for any code that reads `$env/dynamic/private`. Read configuration through `serverEnv()` in `src/lib/server/env.ts`, called from inside a function — see `src/lib/auth.ts` for the pattern.

## Logging

Use Winston logger for structured logging:

```javascript
import { createLogger } from '$lib/server/logger';

const logger = createLogger('ComponentName');

// Usage
logger.debug('Debug message', { userId: 123 });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error, { context: 'additional' });
```

Logger is configured via environment variables (see Environment Variables section).

## Environment Variables

- `DATABASE_URL` - Dev database (auto-configured)
- `TEST_DATABASE_URL` - Test database (auto-configured)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: warn)
- `LOG_FORMAT` - Logging format: human, json (default: human)

## Port Forwarding

- 5173: SvelteKit dev server
- 5432: PostgreSQL dev database (local Docker mode only)
- 5433: PostgreSQL test database (local Docker mode only)
- 5555: Drizzle Studio

## SvelteKit Server Actions Best Practices

### Handling Redirects in Try-Catch Blocks

**IMPORTANT**: In SvelteKit, `redirect()` throws a special `Redirect` object that should not be caught as an error. Always handle redirects properly:

```javascript
// ❌ BAD: Redirect gets caught as error
try {
	// ... database operations
	throw redirect(303, '/success');
} catch (error) {
	console.error('Error:', error); // Logs the redirect as error!
	return fail(500, { message: 'Error occurred' });
}

// ✅ GOOD: Re-throw redirects
try {
	// ... database operations
	throw redirect(303, '/success');
} catch (error) {
	// Re-throw redirects (check for Response with redirect status)
	if (error instanceof Response && error.status >= 300 && error.status < 400) {
		throw error;
	}
	console.error('Actual error:', error);
	return fail(500, { message: 'Error occurred' });
}

// ✅ BETTER: Keep redirects outside try-catch when possible
try {
	// ... database operations that might fail
	const result = await db.delete(table).where(condition);
	if (!result) {
		return fail(404, { message: 'Not found' });
	}
} catch (error) {
	console.error('Database error:', error);
	return fail(500, { message: 'Database error' });
}
// Redirect only after successful operation
throw redirect(303, '/success');
```

## Form Validation & Authentication Patterns

### Implementation Guides

For detailed implementation patterns, see the AI-optimized howto guides:

- **[Authentication Patterns](./ai-dev-docs/howtos/better-auth-patterns.md)**: Better Auth client/server implementation, session management, error handling
- **[Forms with Server Actions](./ai-dev-docs/howtos/formsnap-superforms-with-actions.md)**: Database operations, CRUD patterns, progressive enhancement
- **[Client-Only Forms (SPA Mode)](./ai-dev-docs/howtos/formsnap-superforms-client-only.md)**: Authentication forms, async handling, Svelte 5 stores

### Quick Reference

**Form Schema Organization:**

- Place `schema.ts` alongside route files
- Export both schema and TypeScript type
- Reuse `passwordSchema` from `$lib/validators/password`

**When to use which pattern:**

- **Server Actions**: Database operations, file uploads, progressive enhancement needed
- **Client-Only (SPA)**: Authentication forms, Better Auth methods, real-time validation
- **Always**: Use Zod schemas, Formsnap components, proper error handling

### External Documentation

- **Zod API**: https://zod.dev/api
- **Formsnap**: https://formsnap.dev/docs/quick-start
- **Superforms**: https://superforms.rocks/api
- **shadcn-svelte Forms**: https://shadcn-svelte.com/docs/components/form

## Component Guidelines

### Select Component (bits-ui)

```svelte
<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	let value = $state<string>(''); // String for single select
	const options = [
		{ value: 'opt1', label: 'Option 1' },
		{ value: 'opt2', label: 'Option 2' }
	];
	let label = $derived(
		value ? options.find((o) => o.value === value)?.label || 'Select' : 'Select'
	);
</script>

<Select.Root type="single" bind:value>
	<Select.Trigger>{label}</Select.Trigger>
	<Select.Content>
		{#each options as opt}
			<Select.Item value={opt.value} label={opt.label} />
		{/each}
	</Select.Content>
</Select.Root>
```

## Milkdown Editor

Rich text editing uses [Milkdown](https://milkdown.dev) (ProseMirror based, markdown first).

- Component: `src/lib/components/document-editor/MilkdownEditor.svelte` (CommonMark + GFM presets)
- Storage format: markdown in a `text` column, not ProseMirror JSON
- Legacy TipTap JSON rows are converted on read by `toMarkdown()` in
  `src/lib/server/documents/content-format.ts`
- AI generated markdown is validated against the constructs the editor can
  round-trip in `src/lib/server/documents/markdown-validator.ts`
- **Milkdown docs**: https://milkdown.dev/docs/guide/getting-started

## Better Auth Docs

- Organization: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/organization.mdx
- Admin: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/plugins/admin.mdx

## Svelte/SvelteKit Docs (Compact)

- Svelte: https://svelte.dev/docs/svelte/llms-small.txt
- SvelteKit: https://svelte.dev/docs/kit/llms-small.txt

## Important Guidelines

### Code Style

- Follow existing patterns and conventions
- Check neighboring files for library usage
- Never add comments unless asked
- Use existing components as reference

### Security

- Never expose or log secrets/keys
- Never commit secrets to repository
- Test endpoints only work in test environment

### Testing Philosophy

- Fix root cause, not symptoms
- Run specific tests when debugging
- Check test reports after failures
- Task per failing test until fixed

## Decision Making

Act as expert software engineer. Make decisions based on:

- Codebase maintainability
- Ability to add features fast
- Ship fast and reliable
  Argue for these decisions.

## E2E Failure Triage

After test failures:

1. Read the Cypress output - it names the failed assertion and the selector it looked for
2. Screenshots of failures are written to `cypress/screenshots/`
3. Re-run only the failing spec while iterating, then the full suite before finishing
4. Use a 10-minute timeout for the full suite: `Bash(npm run test:e2e, timeout: 600000)`

## Agent Hooks

- **PreToolUse**: Blocks destructive commands (`rm -rf`, force push, `git reset --hard`), protects sensitive files (`.env*`, lock files, credentials), and advises spec-first workflow for screen-affecting edits
- **PostToolUse**: Auto-formats `.ts`/`.js`/`.svelte`/`.md`/`.json` with Prettier; lints `.ts`/`.js`/`.svelte` with ESLint
- **Stop**: Runs unit tests (+ integration if test DB available) before agent finishes; blocks if screen specs modified without observed behavior verification
- **SessionStart**: Injects git state and service health on new sessions; re-injects reminders after compaction
- **Pre-push** (Husky): Runs unit tests always; integration/E2E opportunistically when services are running

## Architecture Documentation

PlantUML diagrams in `docs/arc42/` provide agent-readable architecture documentation:

- `docs/arc42/api-surface.puml` — All routes, methods, form actions, auth guards
- `docs/arc42/service-architecture.puml` — Server services, DB, auth, AI, external systems

Read these diagrams to understand the system before making changes.

## Agent Workflows

Reusable step-by-step instructions in `docs/agent-workflows/` for recurring tasks:

- `docs/agent-workflows/validate-api-surface.md` — Validate and update the API surface map
- `docs/agent-workflows/validate-service-architecture.md` — Validate and update the service architecture diagram
- `docs/agent-workflows/verify-user-journey-visual.md` — Visual verification of user journey screens

A PostToolUse hook detects `git commit` commands and advises which validation workflows
to run based on changed files. Follow these advisories after your final commit before pushing.

## Spec-First Workflow (Screen Behavior)

When changing code that affects user journey screens, follow this order:

1. **Before**: Update expected behavior in `docs/user-journey-verification/screen-{n}-*.md`
2. **Implement**: Make the code changes
3. **After**: Run `/verify_screen` to visually verify observed behavior via Playwright MCP

| Source file pattern                                | Screen spec(s)          |
| -------------------------------------------------- | ----------------------- |
| `src/routes/(public)/login/*`                      | screen-1-login.md       |
| `src/routes/(public)/register/*`                   | screen-2-register.md    |
| `src/routes/(protected)/(with-sidebar)/home/*`     | screen-3-home.md        |
| `src/routes/(protected)/documents/*`               | screen-4-documents.md   |
| `src/routes/(protected)/(with-sidebar)/settings/*` | screen-5-settings.md    |
| `src/routes/(admin)/admin/*`                       | screen-6-admin-users.md |

Hooks enforce this: PreToolUse advisory reminds you to update specs. Stop hook blocks if
specs were modified but Observed Behavior not filled in (requires dev server running).

## Deep Review Verification

**MANDATORY:** Every implementation plan MUST include `/deep-review` as a verification step. When creating plans (in plan mode), always list `/deep-review` in the verification/testing section.

- Before pushing any code changes, run `/deep-review` to perform a multi-agent convergent review
- The pre-push hook in `.claude/hooks/remind-deep-review.sh` will remind the agent to run `/deep-review` first
- `/deep-review` runs 3-5 agents per cycle from different perspectives (security, architecture, correctness, performance, API)
- Up to 3 cycles with early stopping when no critical/high findings remain
- CRITICAL and HIGH findings are always fixed; MEDIUM and LOW are evaluated contextually

## Subfolder CLAUDE.md Files

Detailed, area-specific conventions live in subfolder `CLAUDE.md` files rather than in this root
file. Check the closest one to whatever you're editing before assuming a convention from here
applies:

- `src/lib/server/CLAUDE.md` - Config/env access, logging, AI provider factory, documents
  operations, external-integration services
- `src/lib/server/db/CLAUDE.md` - Drizzle schema conventions, migration workflow, db client, test
  utilities
- `src/routes/api/v1/CLAUDE.md` - API route tiers, auth enforcement, endpoint patterns
- `src/lib/components/CLAUDE.md` - Svelte 5 runes, shadcn-svelte/bits-ui, forms, i18n status
- `e2e/CLAUDE.md` - E2E testing patterns (check this rather than assuming Playwright specifics
  described elsewhere in this file, since that suite may be mid-migration)
- `ai-dev-docs/CLAUDE.md` - Format for the dense, AI-optimized howto docs under `ai-dev-docs/`
- `scripts/azure-managed-setup/CLAUDE.md` - Azure Container Apps deployment scripts and credential
  handling

## Important Reminders

- Do only what's asked, nothing more
- Prefer editing over creating files
- Never create documentation unless requested
- Always check CLAUDE.md in subdirectories for context-specific instructions
