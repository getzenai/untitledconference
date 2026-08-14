import { callHint, formatInstant, SERVER_ZONE, zoneLabel } from '$lib/conference/deadline';
import { describe, expect, it } from 'vitest';

describe('formatInstant', () => {
	it('names the zone it rendered in', () => {
		expect(formatInstant('2027-02-15T23:59:00.000Z', 'UTC')).toBe('15 Feb 2027, 23:59 UTC');
	});

	/**
	 * The bug in #468, as a test: this instant is the 15th in UTC and the 16th in
	 * Berlin. Both screens used to render it without a zone, so the two days read
	 * as a contradiction. Naming the zone is what makes them the same fact.
	 */
	it('renders one instant as two wall clocks that each say which', () => {
		const closesAt = '2027-02-15T23:59:00.000Z';

		expect(formatInstant(closesAt, 'UTC')).toBe('15 Feb 2027, 23:59 UTC');
		expect(formatInstant(closesAt, 'Europe/Berlin')).toBe('16 Feb 2027, 00:59 CET');
	});

	it('keeps the shape across a daylight-saving boundary', () => {
		expect(formatInstant('2027-07-15T21:59:00.000Z', 'Europe/Berlin')).toBe(
			'15 Jul 2027, 23:59 CEST'
		);
	});

	it('takes a Date as readily as a string', () => {
		expect(formatInstant(new Date('2027-02-15T23:59:00.000Z'), 'UTC')).toBe(
			formatInstant('2027-02-15T23:59:00.000Z', 'UTC')
		);
	});

	it('renders UTC when no zone is known, which is what the server passes', () => {
		expect(formatInstant('2027-02-15T23:59:00.000Z')).toBe(
			formatInstant('2027-02-15T23:59:00.000Z', SERVER_ZONE)
		);
	});

	it('renders nothing rather than "Invalid Date"', () => {
		expect(formatInstant(null)).toBe('');
		expect(formatInstant(undefined)).toBe('');
		expect(formatInstant('')).toBe('');
		expect(formatInstant('not a date')).toBe('');
	});
});

describe('zoneLabel', () => {
	it('is the abbreviation of the moment, not of the zone', () => {
		const winter = new Date('2027-02-15T12:00:00.000Z');
		const summer = new Date('2027-07-15T12:00:00.000Z');

		expect(zoneLabel('Europe/Berlin', winter)).toBe('CET');
		expect(zoneLabel('Europe/Berlin', summer)).toBe('CEST');
	});

	it('matches the zone the stamp beside it prints', () => {
		const at = new Date('2027-02-15T23:59:00.000Z');
		expect(formatInstant(at, 'UTC').endsWith(zoneLabel('UTC', at))).toBe(true);
	});
});

/**
 * The line under the organizer's picker (#468).
 *
 * It exists because the field itself cannot say which clock it is on, and the
 * empty case is the one that matters: with nothing typed there is no instant to
 * read back, so the hint has to name the zone on its own or say nothing useful.
 */
describe('callHint', () => {
	it('reads a stored deadline back in the zone it names', () => {
		expect(callHint('2027-02-15T23:59:00.000Z', 'Europe/Berlin')).toBe(
			'16 Feb 2027, 00:59 CET — speakers see this moment on their own clock'
		);
	});

	/**
	 * Berlin, not UTC, because that is the case the sentence is about — and the
	 * abbreviation floats with the season (CET in winter, CEST in summer) since
	 * there is no stored deadline here to pin it to a moment. The claim under test
	 * is the second half of the sentence, not which of the two labels comes out.
	 */
	it('names the zone alone while the field is still empty', () => {
		expect(callHint(null, 'Europe/Berlin')).toMatch(/^Times are CES?T, your browser's zone$/);
	});

	/**
	 * The server render cannot know where the reader sits, so it must not say it
	 * does. Before `onMount` every screen is on `SERVER_ZONE`, and an organizer in
	 * Berlin would otherwise read "Times are UTC, your browser's zone" — false, on
	 * the one field this module exists to stop lying about.
	 */
	it('does not call the fallback zone the reader’s own', () => {
		expect(callHint(null, 'UTC')).toBe('Times are UTC.');
		expect(callHint(null, 'UTC')).not.toContain('browser');
	});
});
