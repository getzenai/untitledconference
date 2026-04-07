# Repository Guidelines

## Project Structure & Module Organization

- `src/routes` holds SvelteKit pages, API endpoints, and layouts; follow the RESTful pattern (`/resource`, `/resource/new`, `/resource/[id]`) so URLs map predictably to features.
- Shared logic lives in `src/lib` (`components`, `hooks`, `server`, `validation`, `test` utilities) with i18n layers under `paraglide/`.
- Database artifacts sit in `drizzle/` with `drizzle.config.ts`; run schema changes through the provided scripts so Docker-managed instances stay in sync.
- Playwright assets live in `e2e/` (`pages/`, `actions/`, `critical-paths/`); VitePress docs are under `docs/`, and static assets under `static/`.

## Build, Test, and Development Commands

- `npm run dev` starts the app on http://localhost:5173 (fetches secrets from Infisical Cloud; for local Docker DB mode, set DATABASE_URL in .env first).
- `npm run build` + `npm run preview` validate production output; `npm run check` performs `svelte-check` plus sync.
- Quality gates: `npm run lint` (ESLint + Prettier check) and `npm run format` (Prettier write).
- Database utilities: `npm run db:push`, `npm run db:migrate`, `npm run db:studio`. All commands fetch credentials from Infisical automatically.

## Coding Style & Naming Conventions

- Prettier/ESLint outputs are the single source of truth; keep two-space indent, trailing commas, and generated semicolons.
- Svelte components use PascalCase filenames, utilities use kebab-case (`auth-client.ts`), exports stay camelCase.
- Mirror nearby patterns, avoid gratuitous comments, and co-locate tests as `*.unit.test.ts` or `*.integration.test.ts` beside the source when practical.

## Testing Guidelines

- Vitest suites: `npm run test:unit`, `npm run test:integration` (requires `TEST_DATABASE_URL`), `npm run test` for the full stack.
- Playwright: `npm run test:e2e`, or target a spec with `npm run test:e2e -- --grep "name"`; inspect `test-report-for-coding-agents/all-failures.md` when debugging.
- Keep page objects in `/e2e/pages`, actions in `/e2e/actions`; rely on built-in waits—only use the documented 5s exceptions (`waitForLoadState`, `waitForURL`, `waitForResponse`).

## Security & Operational Notes

- Never log or commit secrets; environment variables (`DATABASE_URL`, `TEST_DATABASE_URL`) are pre-wired for localhost (`5432`, `5433`).
- Reset test data through provided fixtures instead of manual SQL to keep suites deterministic.

## Commit & Pull Request Guidelines

- Follow the imperative style seen in history (`Fix test errors`, `Update and condense docs`) and keep subjects ≤72 chars.
- PRs should outline changes, list local verification commands, link issues (`Closes #123`), and attach UI evidence when visuals change.
- Flag schema adjustments so reviewers can run the matching `db:*` command suite before merging.
