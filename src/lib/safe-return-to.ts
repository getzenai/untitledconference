/**
 * Same-origin path only. The old prefix check (`startsWith('/') &&
 * !startsWith('//')`) lets `/\evil.com` through: browsers treat `\` as `/` and
 * land on https://evil.com/. Resolve against the request origin, then inspect
 * the *output* — origin equality is not enough.
 *
 * `https://host//evil.com` is same-origin, but `pathname` is `//evil.com`.
 * `/./\evil.com` has the backslash turned into a slash during resolve, so a
 * leftover-`\` check never sees it. What reaches `redirect()` must be a path
 * with exactly one leading slash.
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
		if (!next.startsWith('/') || next.startsWith('//') || ENCODED_BACKSLASH.test(next)) {
			return FALLBACK;
		}
		return next;
	} catch {
		return FALLBACK;
	}
}
