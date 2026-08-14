import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './safe-return-to';

const ORIGIN = 'https://untitledconference.com';

describe('safeReturnTo', () => {
	it('sends the backslash open-redirect to /home', () => {
		const raw = '/\\evil.com';
		// The prefix check this replaced would have let this through.
		expect(raw.startsWith('/') && !raw.startsWith('//')).toBe(true);
		expect(safeReturnTo(raw, ORIGIN)).toBe('/home');
	});

	it('sends a percent-encoded backslash to /home', () => {
		expect(safeReturnTo('/%5Cevil.com', ORIGIN)).toBe('/home');
		expect(safeReturnTo('/%5cevil.com', ORIGIN)).toBe('/home');
	});

	it('sends protocol-relative, absolute, and javascript: targets to /home', () => {
		expect(safeReturnTo('//evil.com', ORIGIN)).toBe('/home');
		expect(safeReturnTo('https://evil.com', ORIGIN)).toBe('/home');
		expect(safeReturnTo('https://evil.com/phish', ORIGIN)).toBe('/home');
		expect(safeReturnTo('javascript:alert(1)', ORIGIN)).toBe('/home');
	});

	it('keeps a same-origin path with query and hash', () => {
		expect(safeReturnTo('/review/example/1?round=2#score', ORIGIN)).toBe(
			'/review/example/1?round=2#score'
		);
	});

	it('falls back when the value is missing', () => {
		expect(safeReturnTo(null, ORIGIN)).toBe('/home');
		expect(safeReturnTo('', ORIGIN)).toBe('/home');
	});
});
