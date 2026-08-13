/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from '$lib/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server.js';

const paraglideMiddlewareMock = vi.hoisted(() =>
	vi.fn(
		async (
			request: Request,
			handler: (args: { request: Request; locale: string }) => Response | Promise<Response>
		) => handler({ request, locale: 'en' })
	)
);

vi.mock('$lib/auth', () => ({
	auth: { api: { getSession: vi.fn() } }
}));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: paraglideMiddlewareMock
}));

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) =>
		resolve(event)
}));

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence: (...handlers: any[]) => {
		return async ({ event, resolve }: any) => {
			let currentResolve = resolve;
			for (let i = handlers.length - 1; i >= 0; i--) {
				const handler = handlers[i];
				const previousResolve = currentResolve;
				currentResolve = (evt: any, opts?: any) =>
					handler({ event: evt, resolve: (e: any, o?: any) => previousResolve(e, o || opts) });
			}
			return currentResolve(event);
		};
	}
}));

const mockAuth = vi.mocked(auth);

function createMockEvent(pathname: string, method: string, headers: Record<string, string>) {
	const url = new URL(`http://localhost${pathname}`);
	const request = new Request(url, { method, headers: new Headers(headers) });
	return {
		url,
		request,
		locals: {} as any,
		platform: undefined,
		params: {},
		route: { id: null },
		cookies: {
			get: vi.fn(),
			getAll: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn()
		},
		fetch: vi.fn(),
		getClientAddress: vi.fn(),
		isDataRequest: false,
		isSubRequest: false,
		setHeaders: vi.fn()
	};
}

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

/**
 * Kit's own `csrf.checkOrigin` is off (svelte.config.js) because it runs before
 * `handle` and therefore cannot be relaxed for a single route. These tests are
 * what keeps that trade honest: the rule still holds everywhere except the OAuth
 * endpoints, which take a form POST with no Origin header by specification.
 */
describe('the CSRF origin check', () => {
	const mockResolve = vi.fn((_event) => new Response('OK'));

	beforeEach(() => {
		vi.clearAllMocks();
		(mockAuth.api.getSession as any).mockResolvedValue(null);
	});

	it('blocks a cross-origin form POST to a form action', async () => {
		const event = createMockEvent('/login', 'POST', { ...FORM, origin: 'https://evil.example' });

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).toBe(403);
		expect(await response.text()).toContain('Cross-site POST form submissions are forbidden');
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('blocks a form POST that carries no origin at all', async () => {
		const event = createMockEvent('/login', 'POST', FORM);

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).toBe(403);
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('blocks the other unsafe methods too, not just POST', async () => {
		for (const method of ['PUT', 'PATCH', 'DELETE']) {
			const event = createMockEvent('/login', method, {
				...FORM,
				origin: 'https://evil.example'
			});
			const response = await handle({ event: event as any, resolve: mockResolve });
			expect(response.status, method).toBe(403);
		}
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('blocks the other form content types too', async () => {
		for (const type of ['multipart/form-data; boundary=x', 'text/plain']) {
			const event = createMockEvent('/login', 'POST', {
				'content-type': type,
				origin: 'https://evil.example'
			});
			const response = await handle({ event: event as any, resolve: mockResolve });
			expect(response.status, type).toBe(403);
		}
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('allows a same-origin form POST', async () => {
		const event = createMockEvent('/login', 'POST', { ...FORM, origin: 'http://localhost' });

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).not.toBe(403);
		expect(mockResolve).toHaveBeenCalled();
	});

	it('ignores JSON requests, which a form cannot forge', async () => {
		const event = createMockEvent('/api/v1/public/login', 'POST', {
			'content-type': 'application/json',
			origin: 'https://evil.example'
		});

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).not.toBe(403);
		expect(mockResolve).toHaveBeenCalled();
	});

	it('ignores GET, which the rule never covered', async () => {
		const event = createMockEvent('/login', 'GET', { origin: 'https://evil.example' });

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).not.toBe(403);
		expect(mockResolve).toHaveBeenCalled();
	});

	it('lets the OAuth token exchange through without an origin header', async () => {
		// RFC 6749: the token request is form-encoded and made server-to-server, so
		// there is no Origin to send. Blocking it breaks the last step of every MCP
		// client's OAuth flow — registration and authorization succeed, the token
		// exchange returns HTML 403, and the client reports an unparseable error.
		for (const path of [
			'/api/auth/oauth2/token',
			'/api/auth/oauth2/register',
			'/api/auth/oauth2/revoke',
			'/api/auth/oauth2/introspect'
		]) {
			const event = createMockEvent(path, 'POST', FORM);
			const response = await handle({ event: event as any, resolve: mockResolve });
			expect(response.status, path).not.toBe(403);
			expect(mockResolve, path).toHaveBeenCalled();
			mockResolve.mockClear();
		}
	});

	it('does not exempt the cookie-authenticated OAuth management endpoints', async () => {
		// These live under the same `/api/auth/oauth2/` prefix as the token endpoint
		// but are the opposite kind of call: a signed-in user's session cookie is the
		// only thing authorizing them. A prefix exemption would leave them open to
		// the cross-site form the check exists for.
		for (const path of ['/api/auth/oauth2/create-client', '/api/auth/oauth2/delete-consent']) {
			const event = createMockEvent(path, 'POST', { ...FORM, origin: 'https://evil.example' });
			const response = await handle({ event: event as any, resolve: mockResolve });
			expect(response.status, path).toBe(403);
		}
		expect(mockResolve).not.toHaveBeenCalled();
	});

	it('does not exempt the rest of Better Auth', async () => {
		// The exemption is the OAuth endpoints, not `/api/auth` wholesale: a
		// cross-origin form POST to sign-in would be a session-riding request.
		const event = createMockEvent('/api/auth/sign-in/email', 'POST', {
			...FORM,
			origin: 'https://evil.example'
		});

		const response = await handle({ event: event as any, resolve: mockResolve });

		expect(response.status).toBe(403);
		expect(mockResolve).not.toHaveBeenCalled();
	});
});
