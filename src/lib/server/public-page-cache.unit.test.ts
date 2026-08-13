import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { describe, expect, it, vi } from 'vitest';
import {
	PUBLIC_CACHE_CONTROL,
	PUBLIC_CACHE_VARY,
	isCacheablePublicRequest,
	publicPageCacheHandler,
	publicPageCacheKey
} from './public-page-cache';

describe('PUBLIC_CACHE_CONTROL', () => {
	it('does not grant the CDN a shared TTL — Cloudflare ignores Vary except Accept-Encoding', () => {
		expect(PUBLIC_CACHE_CONTROL).not.toMatch(/s-maxage/i);
		expect(PUBLIC_CACHE_CONTROL).toMatch(/max-age=60/);
	});
});

describe('isCacheablePublicRequest', () => {
	it('accepts the four anonymous surfaces', () => {
		for (const path of [
			'/c/my-conf',
			'/c/my-conf/agenda',
			'/c/my-conf/speakers',
			'/c/my-conf/itinerary'
		]) {
			expect(isCacheablePublicRequest('GET', path, null), path).toBe(true);
		}
	});

	it('rejects everything that renders or depends on user state', () => {
		for (const path of [
			'/c/my-conf/cfp', // signed-in and anonymous visitors get different HTML
			'/c/my-conf/speakers/abc123', // not on the allow-list
			'/c/my-conf/gallery',
			'/c/my-conf/agenda.ics',
			'/c', // no slug
			'/login',
			'/manage/my-conf'
		]) {
			expect(isCacheablePublicRequest('GET', path, null), path).toBe(false);
		}
	});

	it('rejects non-GET methods', () => {
		expect(isCacheablePublicRequest('POST', '/c/my-conf', null)).toBe(false);
		expect(isCacheablePublicRequest('HEAD', '/c/my-conf', null)).toBe(false);
	});

	it('rejects any request carrying a Better Auth cookie, prefixed or not', () => {
		for (const cookie of [
			'better-auth.session_token=abc',
			'__Secure-better-auth.session_token=abc',
			'__Host-better-auth.csrf=abc',
			'ph_cookie=x; better-auth.dont_remember=1'
		]) {
			expect(isCacheablePublicRequest('GET', '/c/my-conf', cookie), cookie).toBe(false);
		}
	});

	it('accepts unrelated cookies — analytics must not defeat the cache', () => {
		expect(isCacheablePublicRequest('GET', '/c/my-conf', 'ph_abc_posthog=xyz')).toBe(true);
	});
});

describe('publicPageCacheKey', () => {
	it('embeds the exact locale Paraglide resolves for the request', () => {
		const url = new URL('https://example.com/c/my-conf/agenda');
		const german = publicPageCacheKey(
			url,
			new Request(url, { headers: { 'accept-language': 'de-DE,de;q=0.9' } })
		);
		expect(new URL(german.url).searchParams.get('__rendered_locale')).toBe(
			extractLocaleFromRequest(
				new Request(url, { headers: { 'accept-language': 'de-DE,de;q=0.9' } })
			)
		);
		expect(new URL(german.url).searchParams.get('__rendered_locale')).toBe('de');
	});

	it('keeps the original query string in the key', () => {
		const url = new URL('https://example.com/c/my-conf?embed=1');
		const key = publicPageCacheKey(url, new Request(url));
		expect(key.url).toContain('embed=1');
	});
});

type FakeEvent = Parameters<typeof publicPageCacheHandler>[0]['event'];

function makeEvent(overrides: {
	path?: string;
	cookie?: string;
	cache?: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
	waitUntil?: ReturnType<typeof vi.fn>;
}): FakeEvent {
	const url = new URL(`https://example.com${overrides.path ?? '/c/my-conf'}`);
	const headers = new Headers();
	if (overrides.cookie) headers.set('cookie', overrides.cookie);
	return {
		url,
		request: new Request(url, { headers }),
		platform: overrides.cache
			? {
					caches: { default: overrides.cache },
					ctx: overrides.waitUntil ? { waitUntil: overrides.waitUntil } : undefined
				}
			: undefined
	} as unknown as FakeEvent;
}

function fakeCache(hit?: Response) {
	return {
		match: vi.fn().mockResolvedValue(hit),
		put: vi.fn().mockResolvedValue(undefined)
	};
}

describe('publicPageCacheHandler', () => {
	it('serves a cached response without resolving the request', async () => {
		const cache = fakeCache(new Response('<html>cached</html>', { status: 200 }));
		const resolve = vi.fn();
		const response = await publicPageCacheHandler({
			event: makeEvent({ cache }),
			resolve
		} as never);

		expect(resolve).not.toHaveBeenCalled();
		expect(response.headers.get('x-public-cache')).toBe('hit');
		expect(await response.text()).toBe('<html>cached</html>');
	});

	it('stores a 200 on miss and stamps the cache header', async () => {
		const cache = fakeCache();
		const waitUntil = vi.fn();
		const resolve = vi.fn().mockResolvedValue(new Response('<html>fresh</html>', { status: 200 }));
		const response = await publicPageCacheHandler({
			event: makeEvent({ cache, waitUntil }),
			resolve
		} as never);

		expect(response.headers.get('cache-control')).toBe(PUBLIC_CACHE_CONTROL);
		expect(response.headers.get('cdn-cache-control')).toBeNull();
		expect(response.headers.get('vary')).toBe(PUBLIC_CACHE_VARY);
		expect(response.headers.get('x-public-cache')).toBe('miss');
		expect(cache.put).toHaveBeenCalledOnce();
		// The write is deferred so the visitor's bytes go out first.
		expect(waitUntil).toHaveBeenCalledOnce();
	});

	it('never stores a non-200', async () => {
		const cache = fakeCache();
		const resolve = vi.fn().mockResolvedValue(new Response('gone', { status: 404 }));
		const response = await publicPageCacheHandler({
			event: makeEvent({ cache }),
			resolve
		} as never);

		expect(cache.put).not.toHaveBeenCalled();
		expect(response.headers.get('cache-control')).toBeNull();
	});

	it('never stores a response that sets a cookie', async () => {
		const cache = fakeCache();
		const resolve = vi
			.fn()
			.mockResolvedValue(new Response('ok', { status: 200, headers: { 'set-cookie': 'a=b' } }));
		await publicPageCacheHandler({ event: makeEvent({ cache }), resolve } as never);

		expect(cache.put).not.toHaveBeenCalled();
	});

	it('bypasses the cache entirely for a signed-in visitor', async () => {
		const cache = fakeCache(new Response('cached', { status: 200 }));
		const resolve = vi.fn().mockResolvedValue(new Response('personal', { status: 200 }));
		const response = await publicPageCacheHandler({
			event: makeEvent({ cache, cookie: 'better-auth.session_token=abc' }),
			resolve
		} as never);

		expect(cache.match).not.toHaveBeenCalled();
		expect(cache.put).not.toHaveBeenCalled();
		expect(response.headers.get('cache-control')).toBeNull();
		expect(await response.text()).toBe('personal');
	});

	it('still sends the cache header when no edge cache exists (dev, Node)', async () => {
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
		const response = await publicPageCacheHandler({ event: makeEvent({}), resolve } as never);

		expect(response.headers.get('cache-control')).toBe(PUBLIC_CACHE_CONTROL);
		expect(response.headers.get('cdn-cache-control')).toBeNull();
		expect(response.headers.get('vary')).toBe(PUBLIC_CACHE_VARY);
	});

	it('renders normally when the cache lookup itself fails', async () => {
		const cache = {
			match: vi.fn().mockRejectedValue(new Error('cache down')),
			put: vi.fn().mockResolvedValue(undefined)
		};
		const resolve = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
		const response = await publicPageCacheHandler({
			event: makeEvent({ cache }),
			resolve
		} as never);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});
});
