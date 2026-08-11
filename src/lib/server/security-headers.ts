/**
 * Security headers applied to every response by the outermost handler in
 * `src/hooks.server.ts`, so they also cover the short-circuit responses produced
 * further down (401/403) and every non-HTML API response.
 *
 * Deliberately no script or style Content-Security-Policy: a CSP that doesn't
 * break SvelteKit's inline hydration script has to be issued via `kit.csp` in
 * `svelte.config.js`, which nonces those scripts. Setting one from here would
 * block hydration. Configure `kit.csp` once the app's script and style origins
 * are known. The one directive sent from here, `frame-ancestors`, is safe to
 * send alone: it governs who may frame the document and touches no script.
 */

import { isEmbeddableSurface } from '$lib/conference/embed';

/**
 * HSTS applies per-response (RFC 6797), so it must ride on every response the
 * app emits — including redirects, API responses and error responses that never
 * render HTML. Browsers ignore the header over plain HTTP, so sending it
 * unconditionally is safe in local dev.
 */
export const HSTS_HEADER_VALUE = 'max-age=31536000; includeSubDomains';

/**
 * The headers that belong on everything, HTML or not.
 *
 * `nosniff` is here rather than on the routes that need it most because the
 * routes that need it most are the ones we already know about. The two file
 * download endpoints set it themselves and pair it with `Content-Disposition:
 * attachment`; that stays, both because it is local and legible where it is and
 * because a download route should not depend on a hook for its safety. What this
 * covers is everything else — the next endpoint that returns bytes somebody
 * uploaded and whose author did not think about sniffing.
 *
 * `Referrer-Policy` rides along because it is the same kind of header on the same
 * response: `strict-origin-when-cross-origin` keeps the path out of the Referer
 * on cross-origin requests, which matters here because our paths carry conference
 * slugs and submission ids.
 */
const ALWAYS_ON: Record<string, string> = {
	'Strict-Transport-Security': HSTS_HEADER_VALUE,
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export function applySecurityHeaders(response: Response, pathname = '/'): Response {
	let target = response;

	try {
		for (const [name, value] of Object.entries(ALWAYS_ON)) {
			response.headers.set(name, value);
		}
	} catch {
		// fetch()-derived responses (e.g. a proxied upstream) carry immutable
		// headers; rewrap the body to attach ours. Every header is re-set on the
		// copy, not just the one that threw — a partial application would depend on
		// which of them the loop had reached.
		const headers = new Headers(response.headers);
		for (const [name, value] of Object.entries(ALWAYS_ON)) {
			headers.set(name, value);
		}
		target = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}

	// Clickjacking protection is only meaningful for rendered documents; setting
	// it on API and asset responses would be noise.
	if ((target.headers.get('content-type') ?? '').includes('text/html')) {
		if (isEmbeddableSurface(pathname)) {
			// The five public widgets are meant to be framed — that is the whole of
			// EMB-15, and a share page offering a snippet the server then refuses is
			// a lie told in two files. `frame-ancestors *` says the same thing
			// X-Frame-Options cannot: allow anyone. The two headers must not both be
			// sent, because X-Frame-Options has no "allow from everyone" value and
			// browsers that honour it would win the argument.
			target.headers.set('Content-Security-Policy', 'frame-ancestors *');
		} else {
			target.headers.set('X-Frame-Options', 'DENY');
		}
	}

	return target;
}
