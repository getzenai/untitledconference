/**
 * Same-origin path only. The old prefix check (`startsWith('/') &&
 * !startsWith('//')`) lets `/\evil.com` through: browsers treat `\` as `/` and
 * land on https://evil.com/. Resolve against the request origin instead and
 * keep pathname + search + hash.
 *
 * Encoded backslash (`%5C`) is rejected too — `new URL` leaves it in the path,
 * but a later Location hop can still treat it as a separator.
 */
const FALLBACK = '/home';
const ENCODED_BACKSLASH = /%5c/i;

export function safeReturnTo(raw: string | null | undefined, origin: string): string {
	if (!raw) return FALLBACK;
	try {
		const resolved = new URL(raw, origin);
		if (resolved.origin !== origin) return FALLBACK;
		const next = resolved.pathname + resolved.search + resolved.hash;
		if (next.includes('\\') || ENCODED_BACKSLASH.test(next)) return FALLBACK;
		return next;
	} catch {
		return FALLBACK;
	}
}
