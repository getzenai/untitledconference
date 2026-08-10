/**
 * The half of #17 that props cannot show: the *hook* has to hand the binding on.
 *
 * `request-scope.unit.test.ts` proves `withRequestScopedDb` carries whatever
 * address it is given. That stays green even if `hooks.server.ts` passes
 * nothing — the connection would quietly fall back to `DATABASE_URL` and the
 * Worker would keep crossing the ocean per query, with every test still passing
 * and no error anywhere. Only driving `handle` catches that.
 *
 * Everything below the database scope is mocked out, following the pattern in
 * `src/routes/api/v1/api-routing-*.unit.test.ts`; no connection is opened.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../../../hooks.server.js';
import { readScopedConnectionString } from './index';

const paraglideMiddlewareMock = vi.hoisted(() =>
	vi.fn(
		async (
			request: Request,
			handler: (args: { request: Request; locale: string }) => Response | Promise<Response>
		) => handler({ request, locale: 'en' })
	)
);

vi.mock('$lib/auth', () => ({ auth: { api: { getSession: vi.fn().mockResolvedValue(null) } } }));
vi.mock('$lib/paraglide/server', () => ({ paraglideMiddleware: paraglideMiddlewareMock }));
vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) =>
		resolve(event)
}));
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handlers: any[]) =>
		async ({ event, resolve }: any) => {
			let currentResolve = resolve;
			for (let i = handlers.length - 1; i >= 0; i--) {
				const handler = handlers[i];
				const previousResolve = currentResolve;
				currentResolve = (evt: any, opts?: any) =>
					handler({ event: evt, resolve: (e: any, o?: any) => previousResolve(e, o || opts) });
			}
			return currentResolve(event);
		}
}));

/** A public GET, so nothing below the scope handler needs a session. */
function eventWith(platform: unknown) {
	const url = new URL('http://localhost/api/v1/public/health');
	return {
		url,
		request: new Request(url, { method: 'GET', headers: new Headers() }),
		locals: {} as any,
		platform,
		params: {},
		route: { id: null },
		cookies: { get: vi.fn(), getAll: vi.fn(), set: vi.fn(), delete: vi.fn(), serialize: vi.fn() },
		fetch: vi.fn(),
		getClientAddress: vi.fn(),
		isDataRequest: false,
		isSubRequest: false,
		setHeaders: vi.fn()
	};
}

const workerPlatform = (env?: unknown) => ({ ctx: { waitUntil: vi.fn() }, env });

describe('the Hyperdrive binding reaching the request scope', () => {
	it('is handed to the scope when the Worker request carries one', async () => {
		let seen: string | undefined = 'not-read';
		// Read from inside the request, which is where a query would read it.
		const resolve = vi.fn(async () => {
			seen = readScopedConnectionString();
			return new Response('OK');
		});

		await handle({
			event: eventWith(
				workerPlatform({ HYPERDRIVE: { connectionString: 'postgres://hyperdrive.local/db' } })
			) as any,
			resolve: resolve as any
		});

		expect(seen).toBe('postgres://hyperdrive.local/db');
	});

	it('leaves the scope on DATABASE_URL when the binding is absent', async () => {
		// `wrangler dev` without the binding configured. Inventing an address here
		// would point local development at nothing.
		let seen: string | undefined = 'not-read';
		const resolve = vi.fn(async () => {
			seen = readScopedConnectionString();
			return new Response('OK');
		});

		await handle({ event: eventWith(workerPlatform({})) as any, resolve: resolve as any });

		expect(seen).toBeUndefined();
	});

	it('opens no request scope at all off a Worker', async () => {
		// Node, `vite dev`, tests, scripts: the process-wide client still stands,
		// and a scope here would mean a fresh connection per request for nothing.
		let seen: string | undefined = 'not-read';
		const resolve = vi.fn(async () => {
			seen = readScopedConnectionString();
			return new Response('OK');
		});

		await handle({ event: eventWith(undefined) as any, resolve: resolve as any });

		expect(seen).toBeUndefined();
	});
});
