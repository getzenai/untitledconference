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
