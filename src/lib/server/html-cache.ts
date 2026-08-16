/**
 * What a browser may do with our HTML.
 *
 * Until #702 the answer was "whatever you like": pages such as `/login` went out
 * with no `cache-control` at all, and a header-less response is the one case
 * where the HTTP caches get to guess. They guess generously. A browser that
 * kept `/login` for a few minutes served its stored copy after we deployed —
 * copy that names `_app/immutable/entry/app.<hash>.js`, a file the deploy had
 * just deleted. The page rendered, the module 404ed, hydration never ran, and
 * the form sat there dead. Measured live: the referenced chunk answered 404
 * while the fresh HTML named a different hash.
 *
 * The document is the only part of a build that is not content-addressed — it is
 * what *names* the hashed files — so it is the one part that must never be
 * reused across deploys. `no-cache` says exactly that, and says only that: the
 * browser may keep the copy, but it must ask before using it. `private` keeps
 * shared caches (our zone, any proxy) out of documents that are rendered for one
 * signed-in person.
 *
 * `_app/immutable/*` is untouched by this — those responses are Cloudflare's
 * static assets, they never reach this handler, and their long cache lifetime is
 * correct precisely because their names change with their contents.
 *
 * The four anonymous conference pages set their own `cache-control` in
 * `public-page-cache.ts` for a reason measured over three deploys (see the file
 * header). This handler never overwrites a header that is already there.
 */

import type { Handle } from '@sveltejs/kit';

/**
 * `no-cache` — keep it, but revalidate before use — rather than `no-store`.
 * `no-store` would also evict the page from the back/forward cache on Chrome,
 * making the back button a full round trip on every page in the app. Stale HTML
 * is the fault being fixed; a slower back button is not a price it needs.
 */
export const HTML_CACHE_CONTROL = 'private, no-cache';

const isHtml = (response: Response) =>
	(response.headers.get('content-type') ?? '').includes('text/html');

/** Stamps `HTML_CACHE_CONTROL` on HTML responses that do not already say. */
export function applyHtmlCacheHeaders(response: Response): Response {
	if (!isHtml(response) || response.headers.has('cache-control')) return response;

	try {
		response.headers.set('cache-control', HTML_CACHE_CONTROL);
		return response;
	} catch {
		// A response derived from `fetch()` carries immutable headers — rewrap it,
		// the same way `applySecurityHeaders` does.
		const headers = new Headers(response.headers);
		headers.set('cache-control', HTML_CACHE_CONTROL);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}
}

export const htmlCacheHandler: Handle = async ({ event, resolve }) =>
	applyHtmlCacheHeaders(await resolve(event));
