/**
 * The derivation the agenda grid stands on.
 *
 * These are cheap to test and expensive to get wrong: every conference_day row
 * in the product comes out of `datesInRange`, and a day that is off by one is a
 * column of sessions on the wrong date.
 */
import { describe, expect, it } from 'vitest';
import {
	datesInRange,
	invalidRangeField,
	isCalendarDate,
	MAX_CONFERENCE_DAYS
} from './conference-dates';

describe('isCalendarDate', () => {
	it('accepts a real day and refuses one the calendar does not have', () => {
		expect(isCalendarDate('2028-05-12')).toBe(true);
		// 2028 is a leap year, 2027 is not — and `new Date` would roll both of the
		// bad ones forward instead of refusing them.
		expect(isCalendarDate('2028-02-29')).toBe(true);
		expect(isCalendarDate('2027-02-29')).toBe(false);
		expect(isCalendarDate('2028-02-31')).toBe(false);
		expect(isCalendarDate('2028-13-01')).toBe(false);
	});

	it('refuses anything that is not exactly YYYY-MM-DD', () => {
		for (const value of ['', '2028-5-1', '12/05/2028', '2028-05-12T10:00:00Z', 'sometime']) {
			expect(isCalendarDate(value)).toBe(false);
		}
	});
});

describe('datesInRange', () => {
	it('walks the range inclusively at both ends', () => {
		expect(datesInRange('2028-05-12', '2028-05-14')).toEqual([
			'2028-05-12',
			'2028-05-13',
			'2028-05-14'
		]);
	});

	it('crosses a month and a year boundary without arithmetic of its own', () => {
		expect(datesInRange('2028-01-30', '2028-02-02')).toEqual([
			'2028-01-30',
			'2028-01-31',
			'2028-02-01',
			'2028-02-02'
		]);
		expect(datesInRange('2028-12-31', '2029-01-01')).toEqual(['2028-12-31', '2029-01-01']);
		// The leap day is a day, not a gap.
		expect(datesInRange('2028-02-28', '2028-03-01')).toEqual([
			'2028-02-28',
			'2028-02-29',
			'2028-03-01'
		]);
	});

	it('treats a missing end date as a one-day conference', () => {
		expect(datesInRange('2028-05-12', null)).toEqual(['2028-05-12']);
		expect(datesInRange('2028-05-12', '2028-05-12')).toEqual(['2028-05-12']);
	});

	it('derives nothing when the start is missing or unusable', () => {
		// "Not stated yet" is not "no days" — the caller relies on the empty result
		// to leave an existing grid alone rather than to delete it.
		expect(datesInRange(null, '2028-05-14')).toEqual([]);
		expect(datesInRange('not-a-date', '2028-05-14')).toEqual([]);
		expect(datesInRange('2028-05-14', '2028-05-12')).toEqual([]);
	});

	it('does not repeat a day across a DST change', () => {
		// Europe/Berlin springs forward on 26 March 2028; a `setDate` walk in local
		// time yields 26 March twice on a host in that zone.
		const days = datesInRange('2028-03-25', '2028-03-27');
		expect(days).toEqual(['2028-03-25', '2028-03-26', '2028-03-27']);
		expect(new Set(days).size).toBe(days.length);
	});
});

describe('invalidRangeField', () => {
	it('passes an empty, partial or well-ordered range', () => {
		expect(invalidRangeField(null, null)).toBeNull();
		expect(invalidRangeField('2028-05-12', null)).toBeNull();
		expect(invalidRangeField('2028-05-12', '2028-05-12')).toBeNull();
		expect(invalidRangeField('2028-05-12', '2028-05-14')).toBeNull();
	});

	it('names the field that is wrong', () => {
		expect(invalidRangeField('nonsense', null)).toBe('startsOn');
		expect(invalidRangeField('2028-05-12', 'nonsense')).toBe('endsOn');
		expect(invalidRangeField('2028-05-14', '2028-05-12')).toBe('endsOn');
	});

	it('refuses a range longer than the cap, and accepts one exactly at it', () => {
		// The guard is against a mistyped year, which is one keystroke away from
		// tens of thousands of rows the organizer never asked for.
		const start = '2028-05-01';
		const atCap = datesInRange(start, '2028-06-29');
		expect(atCap).toHaveLength(MAX_CONFERENCE_DAYS);
		expect(invalidRangeField(start, atCap[atCap.length - 1])).toBeNull();
		expect(invalidRangeField(start, '2028-06-30')).toBe('endsOn');
		expect(invalidRangeField(start, '2088-05-01')).toBe('endsOn');
	});
});
