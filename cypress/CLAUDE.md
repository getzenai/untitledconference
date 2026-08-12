# E2E Testing Guide (Cypress)

## Structure

```
cypress/
├── e2e/
│   ├── critical-paths/     # login, CRUD, organization, admin, UI showcase, user journey
│   └── unauthenticated/    # specs that need an empty user table (run last)
├── support/
│   ├── commands.ts         # cy.createTestUser, cy.login, cy.loginViaUi, ...
│   ├── e2e.ts              # loaded before every spec
│   ├── globals.ts          # test-user prefix + email generator
│   ├── pages/              # page objects (plain classes, no async/await)
│   └── actions/            # high-level workflows built on page objects
└── tsconfig.json
```

Node-side plumbing (database tasks, timeouts, base URL) lives in `cypress.config.ts`.
The runner script is `scripts/run-e2e.sh`.

## Running

```bash
npm run test:e2e                                                    # whole suite, headless
npm run test:e2e:open                                               # interactive runner
npm run test:e2e:spec -- cypress/e2e/critical-paths/login-workflow.cy.ts   # one spec
SKIP_BUILD=true npm run test:e2e                                    # reuse the previous build
```

The npm scripts create a unique database on the `TEST_DATABASE_URL` server, then
`scripts/run-e2e.sh` pushes its schema, builds the app, starts `vite preview` on a
free port, and runs Cypress against it. The database is force-dropped afterwards,
including on test failure. If `TEST_DATABASE_URL` is unset, the control connection
falls back to the local Docker test server (`docker compose up -d test-db`, port
5433). No Infisical secrets are needed: E2E runs with a throwaway
`BETTER_AUTH_SECRET` and `ENABLE_TEST_ENDPOINTS=true`.

## Custom commands

| Command                          | Purpose                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| `cy.createTestUser(options?)`    | Register via `/api/v1/test/register`; email pre-verified, org created |
| `cy.login(email, password)`      | API login cached with `cy.session()` — use this by default            |
| `cy.loginViaUi(email, password)` | Fill in the real login form; use when the form itself is under test   |
| `cy.createAndLogin(options?)`    | `createTestUser` + `login`                                            |
| `cy.registerViaUi(email, pw)`    | Fill in the real registration form                                    |
| `cy.logout()`                    | Log out from /home and land on /login                                 |
| `cy.waitForHydration()`          | Wait for `body[data-hydrated="true"]` before interacting              |

## Node tasks (`cy.task`)

| Task                        | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `cleanupTestUsers`          | Delete every `e2e-test-*` user + orphaned orgs (runs `after`) |
| `resetDatabase`             | Wipe all users/orgs — only for the first-user-admin spec      |
| `pushDatabaseSchema`        | `drizzle-kit push --force` against the test database          |
| `setUserRole {email, role}` | Force a system role instead of relying on registration order  |
| `markEmailVerified email`   | Stand-in for clicking the link in the verification email      |
| `getUserByEmail email`      | `{ id, email, role }` or `null`                               |
| `countUsers`                | Row count of the user table                                   |

## Selectors, in order of preference

1. `[name="field"]` for form inputs (formsnap puts `name` on every control)
2. `[data-testid="..."]` for test-specific hooks
3. `cy.contains('button', /^Login$/)` for semantic, text-based selection

Avoid CSS class selectors and deep DOM paths — they break on styling changes.

## Things that bite

- **Hydration.** The app is SSR'd; typing and submitting before Svelte hydrates
  hits the raw `<form>` and triggers a native navigation. `BasePage.visit()` and
  `cy.waitForHydration()` wait for `body[data-hydrated="true"]` (set in
  `src/routes/+layout.svelte`). Any form carrying credentials therefore needs an
  explicit `method="POST"` — without it that native navigation is a GET and puts
  the password in the query string; `credential-form-method.cy.ts` guards it.
- **bits-ui primitives are not native inputs.** Checkbox, radio and switch render
  as `<button>` with `data-state="checked" | "unchecked"`; assert on that
  attribute, not `:checked`. `FormActions` already does.
- **Registration leaves `emailVerified` false**, so sign-up redirects to
  `/verify-email`, not `/home`. Use `cy.task('markEmailVerified', email)` to
  continue the journey.
- **Timeouts mean the selector is wrong**, not that rendering is slow. Fix the
  selector rather than raising the timeout.
- **Specs run serially.** Do not add `--parallel`; the test-user cleanup is shared.

## Writing a new spec

```typescript
import type { TestUser } from '../../support/globals';

describe('Feature', () => {
	let testUser: TestUser;

	before(() => {
		cy.createTestUser({ organizationName: 'Feature Org' }).then((user) => {
			testUser = user;
		});
	});

	beforeEach(() => {
		cy.login(testUser.email, testUser.password);
	});

	it('does the thing', () => {
		cy.visit('/manage');
		cy.waitForHydration();
		cy.get('a[href="/manage/new"]').click();
		cy.url().should('include', '/manage/new');
	});
});
```

A conference to work against is usually cheaper to set up through
`POST /api/v1/test/agenda-fixture` than through the UI — see `date-picker.cy.ts`.

## Best practices

1. **Deterministic tests** — one strict story per test, no `if/else` on app state.
2. **No manual waits** — Cypress retries assertions; `cy.wait(ms)` is a smell.
3. **Debug timeouts, don't extend them.**
4. **Prefer `data-testid`** for anything without a stable name or role.
5. **Test isolation** — every test re-establishes its session via `cy.login()`.
6. **Screenshots on failure** land in `cypress/screenshots/` (gitignored).
