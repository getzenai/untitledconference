/**
 * Edge caching for the anonymous public conference pages.
 *
 * A public conference page renders identically for every visitor without a
 * session, yet each request pays the full price: a fresh database connection
 * (a Worker cannot reuse another request's socket), Better Auth's session
 * lookup, and four stages of queries against a database a continent away.
 * Measured from Europe that is ~3 s to the first byte — for HTML that has not
 * changed since the previous visitor asked for it.
 *
 * Two cache layers act on these responses, and the zone's CDN cache is the
 * one doing the observable work: once `s-maxage` is present, Cloudflare
 * caches the page at the edge and answers before the Worker runs at all
 * (`cf-cache-status: HIT` with an `age` header, measured live). Measured
 * live, too: the CDN serves that copy to every request for the URL,
 * **including ones carrying a session cookie** — request cookies do not
 * bypass Cloudflare's cache on this plan. The cookie check below therefore
 * governs what gets *stored* (only anonymous renders, ever) and the in-Worker
 * layer, but for the CDN layer the safety rests entirely on the allow-list:
 * these four pages render no user state at all. The one known casualty is
 * the root layout's impersonation banner, absent for an impersonating admin
 * viewing a ≤60s-old copy. If a surface on the list ever gains user state,
 * it must come OFF the list — the bypass cannot save it at the edge.
 * The explicit Cache API write below is the second, in-Worker layer for
 * requests the CDN lets through; because this handler runs before the database scope and auth
 * handlers in `hooks.server.ts`, a hit there skips the connection handshake
 * and the session queries entirely. When reading headers off the live site,
 * trust `cf-cache-status` for the edge — `x-public-cache` is whatever the
 * stored copy said at store time, so a CDN hit replays `miss`.
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
 * The TTL is 60 seconds (`s-maxage`, so only shared caches hold it — a
 * browser still revalidates). An organizer who edits their conference sees
 * the change everywhere within a minute; the visitors in between get the
 * page in ~50 ms instead of ~3 s. The Cache API is per-colo, so the first
 * visitor in each region still pays full price.
 *
 * The locale rides in the cache key. Today that is a constant: Paraglide's
 * `url` strategy resolves every server request to the base locale before
 * `preferredLanguage` is consulted, so SSR always renders English and the
 * client localizes after hydration. The key still derives the locale from the
 * same function the middleware uses, because Cloudflare's Cache API ignores
 * `Vary` — if the strategy ever starts honoring `Accept-Language` on the
 * server, the cache splits by language on its own instead of serving one
 * visitor's language to everyone.
 */

import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { createLogger } from '$lib/server/logger';
import type { Handle } from '@sveltejs/kit';

const logger = createLogger('PublicPageCache');

/**
 * `max-age` is explicit because its absence is not neutral: Cloudflare's
 * Browser Cache TTL default fills the gap with `max-age=14400`, observed live
 * — a visitor's browser would hold the page for four hours while the edge
 * refreshes every minute. Sixty seconds for both keeps the promise this
 * feature was merged under: an organizer's edit is visible everywhere within
 * a minute, browsers included.
 */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

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
 * with, resolved by the same function the middleware uses — see the module
 * comment for why the locale is in the key even though it is constant today.
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
		// `vite dev`, tests, and any non-Worker deployment: no edge cache to
		// fill, but the header still goes out so a CDN in front of a Node
		// deployment could honor it — and so the behaviour is observable in dev.
		const response = await resolve(event);
		if (response.status === 200) response.headers.set('cache-control', PUBLIC_CACHE_CONTROL);
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
		return response;
	}

	const response = await resolve(event);

	if (response.status === 200 && !response.headers.has('set-cookie')) {
		response.headers.set('cache-control', PUBLIC_CACHE_CONTROL);
		response.headers.set('x-public-cache', 'miss');
		const stored = cache
			.put(key, response.clone() as unknown as Parameters<typeof cache.put>[1])
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
