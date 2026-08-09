/**
 * Security headers applied to every response by the outermost handler in
 * `src/hooks.server.ts`, so they also cover the short-circuit responses produced
 * further down (401/403) and every non-HTML API response.
 *
 * Deliberately no Content-Security-Policy: a CSP that doesn't break SvelteKit's
 * inline hydration script has to be issued via `kit.csp` in `svelte.config.js`,
 * which nonces those scripts. Setting one from here would block hydration.
 * Configure `kit.csp` once the app's script and style origins are known.
 */

/**
 * HSTS applies per-response (RFC 6797), so it must ride on every response the
 * app emits — including redirects, API responses and error responses that never
 * render HTML. Browsers ignore the header over plain HTTP, so sending it
 * unconditionally is safe in local dev.
 */
export const HSTS_HEADER_VALUE = 'max-age=31536000; includeSubDomains';

export function applySecurityHeaders(response: Response): Response {
	let target = response;

	try {
		response.headers.set('Strict-Transport-Security', HSTS_HEADER_VALUE);
	} catch {
		// fetch()-derived responses (e.g. a proxied upstream) carry immutable
		// headers; rewrap the body to attach ours.
		const headers = new Headers(response.headers);
		headers.set('Strict-Transport-Security', HSTS_HEADER_VALUE);
		target = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
	}

	// Clickjacking protection is only meaningful for rendered documents; setting
	// it on API and asset responses would be noise.
	if ((target.headers.get('content-type') ?? '').includes('text/html')) {
		target.headers.set('X-Frame-Options', 'DENY');
	}

	return target;
}
