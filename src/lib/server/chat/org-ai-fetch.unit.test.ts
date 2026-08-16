import { describe, expect, it, vi } from 'vitest';
import { createGuardedChatBackendFetch } from './org-ai-fetch';
import { ChatBackendAddressError, ChatBackendUrlError } from './org-ai-url';

const PUBLIC = '93.184.216.34';
const INTERNAL = '169.254.169.254';

/** A resolver that answers per hostname, defaulting to a public address. */
function resolverFor(map: Record<string, string[]> = {}) {
	return vi.fn(async (hostname: string) => map[hostname] ?? [PUBLIC]);
}

function redirectTo(location: string, status = 307): Response {
	return new Response(null, { status, headers: { location } });
}

function guarded(
	fetchImpl: ReturnType<typeof vi.fn>,
	resolve = resolverFor(),
	maxRedirects?: number
) {
	return createGuardedChatBackendFetch({
		fetchImpl: fetchImpl as unknown as typeof fetch,
		resolve,
		nodeEnv: 'production',
		maxRedirects
	});
}

describe('createGuardedChatBackendFetch', () => {
	it('passes a request to a public backend through, without following redirects itself', async () => {
		const inner = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
		const resolve = resolverFor();

		const response = await guarded(inner, resolve)('https://chat.example.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[]}'
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledWith('chat.example.com');
		const [url, init] = inner.mock.calls[0];
		expect(url).toBe('https://chat.example.com/v1/chat/completions');
		expect(init.method).toBe('POST');
		expect(init.redirect).toBe('manual');
		expect(new TextDecoder().decode(init.body)).toBe('{"messages":[]}');
	});

	it('refuses a backend whose name resolves inside, before it is called', async () => {
		const inner = vi.fn();
		const resolve = resolverFor({ 'chat.example.com': [INTERNAL] });

		await expect(
			guarded(inner, resolve)('https://chat.example.com/v1/chat/completions', { method: 'POST' })
		).rejects.toBeInstanceOf(ChatBackendAddressError);
		expect(inner).not.toHaveBeenCalled();
	});

	it('refuses a redirect from a public host to a private one', async () => {
		const inner = vi
			.fn()
			.mockResolvedValueOnce(redirectTo('https://internal.example.com/v1/chat/completions'))
			.mockResolvedValue(new Response('should never be reached', { status: 200 }));
		const resolve = resolverFor({ 'internal.example.com': [INTERNAL] });

		await expect(
			guarded(inner, resolve)('https://chat.example.com/v1/chat/completions', {
				method: 'POST',
				body: '{"messages":[]}'
			})
		).rejects.toBeInstanceOf(ChatBackendAddressError);

		// The first hop was made, the second was not.
		expect(inner).toHaveBeenCalledTimes(1);
		expect(resolve).toHaveBeenCalledWith('internal.example.com');
	});

	it('refuses a redirect to a direct private address and to plain http', async () => {
		const toAddress = vi.fn().mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest'));
		await expect(
			guarded(toAddress)('https://chat.example.com/v1', { method: 'POST', body: '{}' })
		).rejects.toBeInstanceOf(ChatBackendUrlError);

		const toHttp = vi.fn().mockResolvedValueOnce(redirectTo('http://chat.example.com/v1'));
		await expect(
			guarded(toHttp)('https://chat.example.com/v1', { method: 'POST', body: '{}' })
		).rejects.toBeInstanceOf(ChatBackendUrlError);
	});

	it('follows a public redirect, re-checking and keeping method and body on 307', async () => {
		const inner = vi
			.fn()
			.mockResolvedValueOnce(redirectTo('https://eu.example.com/v1/chat/completions'))
			.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
		const resolve = resolverFor();

		const response = await guarded(inner, resolve)('https://chat.example.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[]}'
		});

		expect(response.status).toBe(200);
		expect(resolve.mock.calls.map(([host]) => host)).toEqual([
			'chat.example.com',
			'eu.example.com'
		]);
		const [url, init] = inner.mock.calls[1];
		expect(url).toBe('https://eu.example.com/v1/chat/completions');
		expect(init.method).toBe('POST');
		expect(new TextDecoder().decode(init.body)).toBe('{"messages":[]}');
	});

	it('drops the body and the method on a 303', async () => {
		const inner = vi
			.fn()
			.mockResolvedValueOnce(redirectTo('https://eu.example.com/v1/result', 303))
			.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		await guarded(inner)('https://chat.example.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[]}'
		});

		const [, init] = inner.mock.calls[1];
		expect(init.method).toBe('GET');
		expect(init.body).toBeUndefined();
		expect(new Headers(init.headers).get('content-type')).toBeNull();
	});

	it('gives up rather than following a redirect loop', async () => {
		const inner = vi.fn().mockResolvedValue(redirectTo('https://chat.example.com/v1/again'));

		await expect(
			guarded(
				inner,
				resolverFor(),
				2
			)('https://chat.example.com/v1', {
				method: 'POST',
				body: '{}'
			})
		).rejects.toBeInstanceOf(ChatBackendAddressError);
		expect(inner).toHaveBeenCalledTimes(3);
	});

	it('returns a 3xx that carries no Location instead of chasing it', async () => {
		const inner = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));

		const response = await guarded(inner)('https://chat.example.com/v1', {
			method: 'POST',
			body: '{}'
		});

		expect(response.status).toBe(302);
		expect(inner).toHaveBeenCalledTimes(1);
	});
});
