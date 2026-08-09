/**
 * Date formatting for the public surfaces.
 *
 * Narrow on purpose: it covers the one thing that went wrong in production
 * rather than everything the module does.
 */
import { describe, expect, it } from 'vitest';
import { formatDayLong, isoDay } from './public-view';

describe('isoDay', () => {
	it('keeps the year, which the obvious wrong version does not', () => {
		const closes = new Date('2027-02-15T23:59:00Z');

		expect(isoDay(closes)).toBe('2027-02-15');
		expect(formatDayLong(isoDay(closes))).toBe('Monday, 15 February 2027');
	});

	it('accepts a string as well as a Date, since load data may arrive either way', () => {
		expect(isoDay('2027-02-15T23:59:00.000Z')).toBe('2027-02-15');
	});

	it('pins the mistake itself, so nobody reaches for it again', () => {
		const closes = new Date('2027-02-15T23:59:00Z');

		// `String(date).slice(0, 10)` looks like it takes the date part. It takes
		// "Mon Feb 15", which `new Date()` reads as the year 2001 — so the live call
		// page announced a 2027 deadline as February 2001, with every check green,
		// because nothing was looking at the rendered text.
		expect(String(closes).slice(0, 10)).toBe('Mon Feb 15');
		expect(new Date(String(closes).slice(0, 10)).getUTCFullYear()).toBe(2001);
	});
});
