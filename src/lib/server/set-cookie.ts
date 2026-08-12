/**
 * Turning a `Set-Cookie` header back into the arguments SvelteKit's `cookies.set`
 * wants.
 *
 * Better Auth answers a server-side sign-in with a `Response` whose cookies are
 * already exactly right — signed, scoped, expiring when the "remember me" box says.
 * A SvelteKit form action cannot hand that `Response` back, only a redirect or a
 * `fail`, so the cookies have to be re-set through `event.cookies`. Re-deriving the
 * attributes ourselves would mean a second opinion on how long a session lives; this
 * copies the one Better Auth gave.
 *
 * Deliberately small: it parses what a cookie header may contain, not what a browser
 * would tolerate. An attribute nobody sets is not handled, and an unparseable header
 * returns `null` rather than a half-built cookie — a session cookie with the wrong
 * `Path` is worse than none, because it fails on the next page instead of this one.
 */
import type { Cookies } from '@sveltejs/kit';

type SetOptions = Parameters<Cookies['set']>[2];

export type ParsedSetCookie = { name: string; value: string; options: SetOptions };

/** `null` when the header has no `name=value` pair to begin with. */
export function parseSetCookie(header: string): ParsedSetCookie | null {
	const [pair, ...attributes] = header.split(';');
	const separator = pair.indexOf('=');
	if (separator <= 0) return null;

	const name = pair.slice(0, separator).trim();
	const value = pair.slice(separator + 1).trim();
	if (!name) return null;

	// `path` is required by SvelteKit's `cookies.set`, and "/" is what a header
	// without one means for our routes anyway.
	const options: SetOptions = { path: '/' };

	for (const attribute of attributes) {
		const index = attribute.indexOf('=');
		const key = (index === -1 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
		const raw = index === -1 ? '' : attribute.slice(index + 1).trim();

		if (key === 'path') options.path = raw || '/';
		else if (key === 'domain') options.domain = raw;
		else if (key === 'expires') {
			const when = new Date(raw);
			if (!Number.isNaN(when.getTime())) options.expires = when;
		} else if (key === 'max-age') {
			const seconds = Number(raw);
			if (Number.isFinite(seconds)) options.maxAge = seconds;
		} else if (key === 'httponly') options.httpOnly = true;
		else if (key === 'secure') options.secure = true;
		else if (key === 'samesite') {
			const mode = raw.toLowerCase();
			if (mode === 'lax' || mode === 'strict' || mode === 'none') options.sameSite = mode;
		}
	}

	return { name, value, options };
}

/** Copies every cookie of a Better Auth response onto this request's own answer. */
export function applySetCookies(cookies: Cookies, headers: Headers): void {
	for (const header of headers.getSetCookie()) {
		const parsed = parseSetCookie(header);
		if (parsed) cookies.set(parsed.name, parsed.value, parsed.options);
	}
}
