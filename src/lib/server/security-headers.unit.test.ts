import { describe, expect, it } from 'vitest';

import { applySecurityHeaders, HSTS_HEADER_VALUE } from './security-headers';

describe('applySecurityHeaders', () => {
	it('sets the HSTS header on a regular response', () => {
		const response = applySecurityHeaders(new Response('hello', { status: 200 }));

		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
		expect(response.status).toBe(200);
	});

	it('sets the HSTS header on a body-less redirect response', () => {
		const response = applySecurityHeaders(
			new Response(null, { status: 301, headers: { Location: 'https://example.com/' } })
		);

		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
		expect(response.status).toBe(301);
		expect(response.headers.get('Location')).toBe('https://example.com/');
	});

	it('rewraps responses with immutable headers instead of throwing', async () => {
		// fetch()-derived responses (e.g. a proxied upstream) have immutable
		// headers; simulate that by making set() throw like the spec does.
		const immutable = new Response('proxied', {
			status: 202,
			headers: { 'X-Upstream': 'origin' }
		});
		immutable.headers.set = () => {
			throw new TypeError('immutable');
		};

		const response = applySecurityHeaders(immutable);

		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
		expect(response.status).toBe(202);
		expect(response.headers.get('X-Upstream')).toBe('origin');
		await expect(response.text()).resolves.toBe('proxied');
	});

	it('tells the browser not to sniff past the declared type', () => {
		// The header the app had nowhere (#43). Its value is the only one the spec
		// defines, so it is pinned exactly rather than matched loosely.
		const response = applySecurityHeaders(
			new Response('{}', { headers: { 'Content-Type': 'application/json' } })
		);

		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('carries every always-on header onto a rewrapped immutable response', () => {
		// The rewrap path is the one that silently drops headers: it used to copy a
		// single one across, so anything added later would exist on ordinary
		// responses and be missing on proxied ones.
		const immutable = new Response('proxied', { status: 200 });
		immutable.headers.set = () => {
			throw new TypeError('immutable');
		};

		const response = applySecurityHeaders(immutable);

		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	});

	it('sets nosniff on an embeddable widget without disturbing its framing rule', () => {
		// The if/else that keeps X-Frame-Options and frame-ancestors mutually
		// exclusive is #38's, and the new header must not reach into it.
		const response = applySecurityHeaders(
			new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
			'/c/devflow-conf-2027/agenda'
		);

		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Content-Security-Policy')).toBe('frame-ancestors *');
		expect(response.headers.get('X-Frame-Options')).toBeNull();
	});

	it('denies framing of HTML documents', () => {
		const response = applySecurityHeaders(
			new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
		);

		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('leaves X-Frame-Options off non-HTML responses', () => {
		const response = applySecurityHeaders(
			new Response('{}', { headers: { 'Content-Type': 'application/json' } })
		);

		expect(response.headers.get('X-Frame-Options')).toBeNull();
		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
	});

	it('lets a public widget surface be framed by anyone', () => {
		const response = applySecurityHeaders(
			new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
			'/c/devflow-conf-2027/agenda'
		);

		// Both headers together would be an argument the browser decides: X-Frame-Options
		// has no "allow anyone" value, so it has to be absent, not permissive.
		expect(response.headers.get('Content-Security-Policy')).toBe('frame-ancestors *');
		expect(response.headers.get('X-Frame-Options')).toBeNull();
	});

	it('keeps denying the pages next door in the same subtree', () => {
		const response = applySecurityHeaders(
			new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
			'/c/devflow-conf-2027/cfp'
		);

		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('Content-Security-Policy')).toBeNull();
	});

	it('denies framing when no path is given at all', () => {
		const response = applySecurityHeaders(
			new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
		);

		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});

	it('rewraps an immutable-header 304 without a body', () => {
		const immutable = new Response(null, { status: 304 });
		immutable.headers.set = () => {
			throw new TypeError('immutable');
		};

		const response = applySecurityHeaders(immutable);

		expect(response.status).toBe(304);
		expect(response.headers.get('Strict-Transport-Security')).toBe(HSTS_HEADER_VALUE);
	});
});
