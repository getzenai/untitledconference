import { HSTS_HEADER_VALUE } from '$lib/server/security-headers';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';

const getSession = vi.hoisted(() => vi.fn());

vi.mock('$lib/auth', () => ({ auth: { api: { getSession } } }));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: vi.fn(
		async (
			request: Request,
			handler: (args: { request: Request; locale: string }) => Response | Promise<Response>
		) => handler({ request, locale: 'en' })
	)
}));

vi.mock('$lib/server/logger', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) =>
		resolve(event)
}));

// The real `sequence` needs SvelteKit's async request store, which only exists
// inside a running server; chain the handlers the same way it does instead.
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handlers: Handle[]) =>
		({ event, resolve }: Parameters<Handle>[0]) => {
			let currentResolve = resolve;
			for (let i = handlers.length - 1; i >= 0; i--) {
				const handler = handlers[i];
				const previousResolve = currentResolve;
				currentResolve = (evt, opts) =>
					handler({ event: evt, resolve: (e, o) => previousResolve(e, o ?? opts) });
			}
			return currentResolve(event);
		}
}));

const GPT_BOT_UA =
	'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const CHROME_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function createEvent(pathname: string, method = 'GET', userAgent?: string) {
	const url = new URL(`http://localhost${pathname}`);
	const headers = new Headers();
	if (userAgent) headers.set('user-agent', userAgent);
	return {
		url,
		request: new Request(url, { method, headers }),
		locals: {},
		params: {},
		route: { id: null }
	} as unknown as RequestEvent;
}

describe('hooks.server security handlers', () => {
	const resolve = vi.fn(async () => new Response('OK'));

	beforeEach(() => {
		vi.clearAllMocks();
		getSession.mockResolvedValue(null);
	});

	it('sets HSTS on a normally resolved response', async () => {
		const response = await handle({ event: createEvent('/'), resolve });

		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
	});

	it('sets HSTS on short-circuited responses too (401 from API protection)', async () => {
		const response = await handle({ event: createEvent('/api/v1/protected'), resolve });

		expect(response.status).toBe(401);
		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
	});

	it('rejects a known AI crawler posting to a public auth endpoint', async () => {
		const response = await handle({
			event: createEvent('/api/v1/public/login', 'POST', GPT_BOT_UA),
			resolve
		});

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
		expect(getSession).not.toHaveBeenCalled();
		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
	});

	it('rejects a known AI crawler posting to the Better Auth endpoint', async () => {
		const response = await handle({
			event: createEvent('/api/auth/sign-in/email', 'POST', GPT_BOT_UA),
			resolve
		});

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets crawlers GET public endpoints so pages stay indexable', async () => {
		const response = await handle({
			event: createEvent('/api/v1/public/health', 'GET', GPT_BOT_UA),
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});

	it('lets a real browser post to a public auth endpoint', async () => {
		const response = await handle({
			event: createEvent('/api/v1/public/login', 'POST', CHROME_UA),
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});

	// Anthropic's own user agent, because it is the client this exemption exists
	// for. Measured on production before the exemption: `POST
	// /api/auth/oauth2/register` with this header answered 403 "Automated clients
	// are not allowed here", so connecting Claude died at its first step.
	const CLAUDE_UA = 'Claude-User/1.0';

	it('lets Claude register an OAuth client, which is what MCP needs', async () => {
		// RFC 7591 client registration has no human caller to protect: the only
		// thing that ever calls it is software.
		const response = await handle({
			event: createEvent('/api/auth/oauth2/register', 'POST', CLAUDE_UA),
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});

	it('lets Claude exchange the authorization code for a token', async () => {
		// The step after registration, and it fails the same way: the client calls
		// the token endpoint itself, with its own user agent. An exemption covering
		// only `register` would move the break one stage later instead of fixing it.
		const response = await handle({
			event: createEvent('/api/auth/oauth2/token', 'POST', CLAUDE_UA),
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});

	it('still rejects Claude signing up, which is what the guard is for', async () => {
		// The exemption is a prefix, so this pins that it did not widen into the
		// rest of /api/auth. Same user agent as the two tests above, opposite
		// answer — that is the boundary, stated in both directions.
		const response = await handle({
			event: createEvent('/api/auth/sign-up/email', 'POST', CLAUDE_UA),
			resolve
		});

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('still rejects a crawler signing in', async () => {
		const response = await handle({
			event: createEvent('/api/auth/sign-in/email', 'POST', GPT_BOT_UA),
			resolve
		});

		expect(response.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('ignores crawler user agents outside the guarded prefixes', async () => {
		const response = await handle({
			event: createEvent('/register', 'POST', GPT_BOT_UA),
			resolve
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});
});
