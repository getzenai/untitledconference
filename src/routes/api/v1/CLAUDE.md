# API Routes (`/api/v1`)

Authentication is enforced centrally by `apiProtectionHandler` in `src/hooks.server.ts`, based on
the URL path prefix. Placing an endpoint in the right directory is what makes it public,
protected, or test-only — there is no per-route auth middleware to wire up.

## Route Tiers (as they exist today)

### `public/` — No Authentication

Passed straight through by `apiProtectionHandler`. Currently: `public/health` (DB connectivity
check used for uptime/health probes), `public/login`, `public/logout`.

### `protected/` — Authenticated Users

`apiProtectionHandler` calls `auth.api.getSession()` itself; if there's no session it returns a
401 JSON response before the route handler ever runs. If a session exists, it sets
`event.locals.user` and lets the request through.

Route handlers still defensively re-check `locals.user` (see `protected/+server.ts`) and return
their own 401 if it's somehow missing — this is a second line of defense, not redundant dead code;
keep doing it in new `protected/` handlers.

### `test/` — Only in Test Environments

Gated by `process.env.ENABLE_TEST_ENDPOINTS === 'true'`; returns 403 in every other environment.
Today this contains `test/register`, used by integration/E2E setup to create a user (and an
organization, and admin role for the very first user) without going through the real signup UI.

Unlike some sibling projects, there is **no additional shared-secret header** gating `test/` here
(no `TEST_ENDPOINTS_SECRET`/`x-test-endpoints-secret` equivalent) — `ENABLE_TEST_ENDPOINTS` is the
only gate. Do not enable it in any publicly reachable environment.

### No `admin/` or API-key tier yet

This starter does **not** have an `api/v1/admin/` prefix or an API-key-authenticated tier (both
exist in some sibling/downstream projects — don't assume they're here). Admin-only access is
enforced at the page layout level instead: `src/routes/(admin)/+layout.server.ts` redirects
non-admins, guarding everything under `(admin)/admin/...` as pages, not API routes. If you add an
admin-only API endpoint, you'll need to decide where auth for it lives — there's no existing
convention to copy for that case yet.

## Writing an Endpoint

```typescript
// +server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { createLogger } from '$lib/server/logger';

const logger = createLogger('MyEndpoint');

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return json({ message: 'Unauthorized. Please login.' }, { status: 401 });

	try {
		// ... business logic
		return json({ data: result });
	} catch (error) {
		logger.error('Operation failed', error as Error, { userId: user.id });
		return json({ error: 'Internal error' }, { status: 500 });
	}
};
```

- Import `RequestHandler` from `@sveltejs/kit`, not the route's generated `./$types` — both work,
  but the existing endpoints use the direct import.
- Response shape is not fully standardized across existing endpoints: some return
  `{ message: string }` on error (`protected/+server.ts`), others `{ error: string }`
  (`test/register/+server.ts`). Prefer `{ error: string }` for new endpoints — it's more common —
  but don't be surprised to see `message` in older code.
- `public/health` is a good template for a dependency-check-style endpoint: try the real check,
  return `200` with a `checks: [...]` array on success, `503` with the same shape plus an
  `error` string on failure.

## Testing

- `api-routing-authenticated.unit.test.ts` and `api-routing-unauthenticated.unit.test.ts`
  (co-located directly in `src/routes/api/v1/`) test `hooks.server.ts`'s `handle` export itself —
  `auth`, the logger, `paraglideMiddleware`, and SvelteKit's `sequence`/`svelteKitHandler` are all
  mocked, so these are pure routing-logic tests with no DB or network. Use them as the template for
  testing changes to the auth/routing handlers, not for testing individual endpoints.
- Individual endpoints get their own `server.integration.test.ts` co-located next to `+server.ts`
  (see `public/health/server.integration.test.ts`) — these run against the real test database via
  `TEST_DATABASE_URL` and call the exported `GET`/`POST` handler directly (not over HTTP). See the
  root `CLAUDE.md` testing section for how unit vs. integration tests are run.
