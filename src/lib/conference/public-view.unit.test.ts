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
		// "Mon Feb 15" — weekday and month, no year — which `new Date()` then reads as
		// the year 2001. That is how the live call page announced a 2027 deadline as
		// February 2001 with every check green: nothing was looking at the rendered text.
		//
		// The expectation is a shape rather than the literal string, because
		// `String(date)` is LOCAL time: this deadline is 23:59Z, so the same line reads
		// "Mon Feb 15" in UTC and "Tue Feb 16" in Berlin. Pinning the literal pinned the
		// timezone of whoever ran it, and turned green in CI into red on half the team's
		// machines. What the bug is actually made of — no year in the slice, and 2001
		// coming out of the parse — holds in every timezone.
		const sliced = String(closes).slice(0, 10);
		expect(sliced).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2}$/);
		expect(new Date(sliced).getUTCFullYear()).toBe(2001);
	});
});
