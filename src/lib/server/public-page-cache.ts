/**
 * In-Worker caching for the anonymous public conference pages.
 *
 * A public conference page renders identically for every visitor without a
 * session, yet each request pays the full price: a fresh database connection
 * (a Worker cannot reuse another request's socket), Better Auth's session
 * lookup, and four stages of queries against a database a continent away.
 * Measured from Europe that is ~3 s to the first byte — for HTML that has not
 * changed since the previous visitor asked for it.
 *
 * The layer that works is the Cache API write below. This handler runs
 * before the database scope and auth handlers in `hooks.server.ts`, so a
 * hit skips the connection handshake and the session queries. The locale
 * rides in the cache key: Cloudflare's Cache API ignores `Vary`, so two
 * visitors with different languages must not share a copy. The key derives
 * the locale from the same function the middleware uses.
 *
 * The zone's CDN is kept out on purpose. Measured live on `36ba312` (#357):
 * Cloudflare's edge cache ignores `Vary` for every header except
 * `Accept-Encoding`. `s-maxage=60` stored one copy per URL — the language
 * of whoever came first after the last purge — and served it to everyone
 * for 60 s *before the Worker ran* (`cf-cache-status: HIT`, German HTML
 * under `Accept-Language: en-US`). The same HIT rewrote `max-age=60` to
 * `max-age=14400` (the zone's Browser Cache TTL). Locale cannot enter the
 * CDN key without an Enterprise custom cache key, so there is no `s-maxage`.
 *
 * Dropping `s-maxage` alone is NOT enough, and the header has to go to
 * exactly one of the two consumers. Both facts are measured:
 *
 * - `CDN-Cache-Control: no-store` on the response handed to `put()` blocks
 *   the write — `caches.default` is Cloudflare's cache and reads the header
 *   (`7d2412d`, six same-colo `x-public-cache: miss` in a row).
 * - Without the header on the response handed to the *visitor*, the zone
 *   caches the page anyway (`031723c`, colo LHR, no query string): req 2
 *   came back `cf-cache-status: HIT`, `max-age` rewritten 60 → 14400, and
 *   an `Accept-Language: en-US` visitor got German HTML — the exact #357
 *   bug. `public, max-age=60` is itself enough for the edge to store; the
 *   zone only stays out of pages that carry no `cache-control` at all
 *   (Hank's Nürnberg measurement of `/`), and this page must carry one for
 *   browsers and for the Cache API TTL.
 *
 * So the belt is stamped on the outgoing copy only, after the clone for
 * `put()` has been taken. The Cache API sees `public, max-age=60`; the edge
 * sees `no-store` and keeps its hands off. A CDN HIT would skip the only
 * layer that keys by locale, which is the whole point of the ~50 ms.
 *
 * Request cookies do not bypass Cloudflare's cache on this plan, so while
 * `s-maxage` was present the CDN also served the anonymous copy to signed-in
 * visitors. The cookie check below still governs what the Cache API stores
 * and looks up (only anonymous renders). These four pages render no user
 * state; if a surface on the list ever gains some, it must come OFF the
 * list.
 *
 * What is deliberately NOT cached:
 *
 * - `/c/[slug]/cfp` renders different HTML for signed-in and anonymous
 *   visitors ("Sign in to submit" vs. the form). The path allow-list below
 *   names the four purely-informational surfaces and nothing else, so a new
 *   sub-route is uncached until someone decides otherwise.
 * - Any request carrying a Better Auth cookie. The four surfaces read no user
 *   state today, but this guard keeps that true even if someone later renders
 *   an "edit" button for organizers: a signed-in visitor never sees — and
 *   never populates — a cached page.
 * - Anything but a 200, and any response that sets a cookie.
 *
 * The Cache API TTL is 60 seconds (`max-age` on the stored response). An
 * organizer who edits their conference sees the change everywhere within a
 * minute; the visitors in between get the page in ~50 ms instead of ~3 s.
 * The Cache API is per-colo, so the first visitor in each region still
 * pays full price. Unprefixed routes honor Accept-Language (#280); `/de/...`
 * stays German because the locale is in the URL.
 */

import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { createLogger } from '$lib/server/logger';
import type { Handle } from '@sveltejs/kit';

const logger = createLogger('PublicPageCache');

/**
 * `max-age=60` is for browsers and for the Cache API TTL. `s-maxage` is
 * absent on purpose: measured on `36ba312`, that directive is what made
 * Cloudflare's edge cache the page and serve the wrong language. The same
 * HIT rewrote this header to `max-age=14400` (Browser Cache TTL). Without
 * a CDN copy there is no HIT, so the visitor sees the 60 s we set.
 */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60';

/**
 * For browsers, which do honor `Vary`. Not a CDN defense — the CDN stays
 * out because there is no `s-maxage`.
 */
export const PUBLIC_CACHE_VARY = 'accept-language';

/**
 * The belt that keeps the zone's edge cache out, stamped on the visitor's
 * copy only. Never on the copy handed to `cache.put()`: `caches.default` is
 * Cloudflare's cache and reads this header on the write path, so putting it
 * there disables the layer that keys by locale.
 */
export const PUBLIC_CDN_CACHE_CONTROL = 'no-store';

function stampPublicCacheHeaders(response: Response) {
	response.headers.set('cache-control', PUBLIC_CACHE_CONTROL);
	response.headers.set('vary', PUBLIC_CACHE_VARY);
}

/** Only ever the response going to the visitor — see the constant above. */
function stampCdnBypass(response: Response) {
	response.headers.set('cdn-cache-control', PUBLIC_CDN_CACHE_CONTROL);
}

/**
 * Exactly the four anonymous surfaces: the conference home, its agenda, its
 * speaker list and the itinerary. `/cfp` (session-dependent), the speaker
 * detail pages and `agenda.ics` are intentionally absent — an allow-list, so
 * whatever gets added under `/c/[slug]/` next is uncached by default.
 */
const CACHEABLE_PATH = /^\/c\/[^/]+(?:\/(?:agenda|speakers|itinerary))?$/;

/**
 * Matches any Better Auth cookie, including the `__Secure-`/`__Host-` prefixed
 * production variants. Matching the whole family rather than just
 * `session_token` costs a few needless cache bypasses and buys certainty that
 * no signed-in state ever reaches — or comes from — the shared cache.
 */
const AUTH_COOKIE = /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\./;

export function isCacheablePublicRequest(
	method: string,
	pathname: string,
	cookieHeader: string | null
): boolean {
	if (method !== 'GET') return false;
	if (!CACHEABLE_PATH.test(pathname)) return false;
	return !(cookieHeader && AUTH_COOKIE.test(cookieHeader));
}

/**
 * The cache key is the request URL plus the locale Paraglide will render
 * with, resolved by the same function the middleware uses. The Cache API
 * ignores `Vary`, so the locale has to live in the key. `Vary` itself is
 * for browsers.
 */
export function publicPageCacheKey(url: URL, request: Request): Request {
	const key = new URL(url.href);
	key.searchParams.set('__rendered_locale', extractLocaleFromRequest(request));
	return new Request(key.href, { method: 'GET' });
}

export const publicPageCacheHandler: Handle = async ({ event, resolve }) => {
	const cacheable = isCacheablePublicRequest(
		event.request.method,
		event.url.pathname,
		event.request.headers.get('cookie')
	);
	if (!cacheable) return resolve(event);

	const cache = event.platform?.caches?.default;
	if (!cache) {
		// `vite dev`, tests, and any non-Worker deployment: no Cache API to
		// fill. The headers still go out so the CDN-bypass is observable in
		// dev and so a Node deployment behind a CDN stays consistent.
		const response = await resolve(event);
		if (response.status === 200) {
			stampPublicCacheHeaders(response);
			stampCdnBypass(response);
		}
		return response;
	}

	// The cast bridges the DOM `Request` this module builds and the
	// `@cloudflare/workers-types` variant the Cache API is typed with — the
	// same object at runtime, two ambient type worlds.
	const key = publicPageCacheKey(event.url, event.request) as unknown as Parameters<
		typeof cache.match
	>[0];

	// A cache failure must never fail the page — fall through to rendering.
	const hit = (await cache.match(key).catch(() => undefined)) as Response | undefined;
	if (hit) {
		// Re-wrapped because a cached Response's headers are immutable, and the
		// security-headers handler above this one still has headers to add.
		const response = new Response(hit.body, hit);
		response.headers.set('x-public-cache', 'hit');
		// The stored copy carries no bypass — it must not, or it would never
		// have been stored. Every copy that leaves the Worker carries one.
		stampCdnBypass(response);
		return response;
	}

	const response = await resolve(event);

	if (response.status === 200 && !response.headers.has('set-cookie')) {
		stampPublicCacheHeaders(response);
		response.headers.set('x-public-cache', 'miss');
		// Clone for the Cache API *before* the CDN bypass goes on, so the
		// stored copy is the one without it.
		const forCache = response.clone();
		stampCdnBypass(response);
		const stored = cache
			.put(key, forCache as unknown as Parameters<typeof cache.put>[1])
			.catch((error) => {
				logger.warn('Could not store a public page in the edge cache', {
					path: event.url.pathname,
					reason: error instanceof Error ? error.message : String(error)
				});
			});
		// Deferred so the visitor gets their bytes before the cache write runs.
		const ctx = event.platform?.ctx;
		if (ctx) ctx.waitUntil(stored);
		else await stored;
	}

	return response;
};
