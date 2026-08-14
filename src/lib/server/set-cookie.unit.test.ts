/**
 * The session cookie of a server-side sign-in survives the trip through a form
 * action (#221) — or it does not, and the person is bounced back to /login on the
 * next page with no idea why. Every attribute here changes how long that session
 * lasts or where it is sent, so they are pinned rather than trusted.
 */
import { describe, expect, it, vi } from 'vitest';
import { applySetCookies, parseSetCookie } from './set-cookie';

describe('parseSetCookie', () => {
	it('reads the cookie Better Auth actually sends', () => {
		const parsed = parseSetCookie(
			'better-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax; Secure'
		);

		expect(parsed).toEqual({
			name: 'better-auth.session_token',
			// Decoded: SvelteKit encodes on write. The header is already encoded
			// (`signCookieValue` percent-encodes the signed token), so handing that
			// string to `cookies.set` would store `abc.def%253D`.
			value: 'abc.def=',
			options: { path: '/', maxAge: 604800, httpOnly: true, sameSite: 'lax', secure: true }
		});
	});

	it('hands SvelteKit the raw token so its encode matches the Better Auth header', () => {
		const header = 'better-auth.session_token=abc.xy%2B%2F%3D; Path=/; HttpOnly; SameSite=Lax';
		const parsed = parseSetCookie(header);

		expect(parsed?.value).toBe('abc.xy+/=');
		// `cookie` serialize, which SvelteKit uses, encodes with encodeURIComponent.
		expect(`better-auth.session_token=${encodeURIComponent(parsed!.value)}`).toBe(
			'better-auth.session_token=abc.xy%2B%2F%3D'
		);
	});

	it('leaves a value that is not valid percent-encoding alone', () => {
		expect(parseSetCookie('a=100%done')?.value).toBe('100%done');
	});

	it('keeps an expiry as a date and a domain as given', () => {
		const parsed = parseSetCookie(
			'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.test; Path=/app'
		);

		expect(parsed?.options.expires?.toISOString()).toBe('2026-10-21T07:28:00.000Z');
		expect(parsed?.options.domain).toBe('example.test');
		expect(parsed?.options.path).toBe('/app');
	});

	it('defaults the path to / rather than leaving it unset', () => {
		// A session cookie without a path is scoped to the directory of the URL that
		// set it — here `/login` — and would be missing everywhere else.
		expect(parseSetCookie('a=1')?.options).toEqual({ path: '/' });
	});

	it('keeps an empty value, which is how a cookie is cleared', () => {
		expect(parseSetCookie('a=; Max-Age=0; Path=/')).toEqual({
			name: 'a',
			value: '',
			options: { path: '/', maxAge: 0 }
		});
	});

	it('ignores attributes it does not know and junk values', () => {
		const parsed = parseSetCookie('a=1; Priority=High; SameSite=sideways; Max-Age=soon');

		expect(parsed?.options.sameSite).toBeUndefined();
		expect(parsed?.options.maxAge).toBeUndefined();
		expect(parsed?.value).toBe('1');
	});

	it('returns null rather than half a cookie', () => {
		expect(parseSetCookie('')).toBeNull();
		expect(parseSetCookie('novalue')).toBeNull();
		expect(parseSetCookie('=1')).toBeNull();
	});
});

describe('applySetCookies', () => {
	it('carries every cookie of the response across, and only those', () => {
		const cookies = { set: vi.fn() };
		const headers = new Headers();
		headers.append('set-cookie', 'better-auth.session_token=t; Path=/; HttpOnly');
		headers.append('set-cookie', 'better-auth.dont_remember=1; Path=/');
		headers.append('x-other', 'ignored');

		applySetCookies(cookies as never, headers);

		expect(cookies.set).toHaveBeenCalledTimes(2);
		expect(cookies.set).toHaveBeenCalledWith('better-auth.session_token', 't', {
			path: '/',
			httpOnly: true
		});
		expect(cookies.set).toHaveBeenCalledWith('better-auth.dont_remember', '1', { path: '/' });
	});

	it('skips a header it cannot read instead of throwing mid-sign-in', () => {
		const cookies = { set: vi.fn() };
		const headers = new Headers();
		headers.append('set-cookie', 'broken');

		applySetCookies(cookies as never, headers);

		expect(cookies.set).not.toHaveBeenCalled();
	});
});
