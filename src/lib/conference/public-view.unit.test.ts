/**
 * Date formatting for the public surfaces.
 *
 * Narrow on purpose: it covers the one thing that went wrong in production
 * rather than everything the module does.
 */
import { describe, expect, it } from 'vitest';
import type { PublicConference } from './public-types';
import {
	buildView,
	daysUntil,
	firstScheduledDayIndex,
	formatDateRange,
	formatDayLong,
	isoDay,
	watchableRecordingUrl
} from './public-view';

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

describe('daysUntil', () => {
	// The counter is read as a deadline, and a deadline is a day, not a span of
	// hours: half past eleven at night on the closing day is still "today", and
	// twenty hours later is "tomorrow", not "in 0 days".
	const now = new Date('2027-02-15T23:30:00Z');

	it('counts day boundaries rather than elapsed hours', () => {
		expect(daysUntil(new Date('2027-02-15T23:59:00Z'), now)).toBe(0);
		expect(daysUntil(new Date('2027-02-16T00:01:00Z'), now)).toBe(1);
		expect(daysUntil(new Date('2027-02-21T09:00:00Z'), now)).toBe(6);
	});

	// Both ends are read in UTC, like every other time on the public site, so the
	// server and the browser cannot disagree about which day it is.
	it('crosses a month and a year without drifting', () => {
		expect(daysUntil(new Date('2027-03-01T09:00:00Z'), new Date('2027-02-27T09:00:00Z'))).toBe(2);
		expect(daysUntil(new Date('2028-01-01T09:00:00Z'), new Date('2027-12-30T09:00:00Z'))).toBe(2);
	});

	it('has nothing to count for a call with no deadline or a deadline gone by', () => {
		expect(daysUntil(null, now)).toBeNull();
		expect(daysUntil(new Date('2027-02-14T23:59:00Z'), now)).toBeNull();
	});
});

describe('firstScheduledDayIndex', () => {
	const conference = (dayIds: string[], scheduledOn: string | null): PublicConference =>
		({
			id: 'conf-1',
			slug: 'days',
			name: 'Days Conf',
			venue: null,
			startsOn: '2027-06-01',
			endsOn: '2027-06-03',
			days: dayIds.map((id, i) => ({
				id,
				date: `2027-06-0${i + 1}`,
				label: `Day ${i + 1}`
			})),
			rooms: [{ id: 'room-1', name: 'Main' }],
			tracks: [],
			formats: [],
			sessions:
				scheduledOn === null
					? []
					: [
							{
								id: 's1',
								title: 'A talk',
								description: '',
								dayId: scheduledOn,
								startsAt: '2027-06-02T09:00:00.000Z',
								endsAt: '2027-06-02T09:30:00.000Z',
								roomId: 'room-1',
								trackId: null,
								formatId: null,
								speakerIds: [],
								recordingUrl: null
							}
						],
			speakers: []
		}) as PublicConference;

	it('opens on the first day that has a session, not the first calendar day', () => {
		const view = buildView(conference(['d1', 'd2', 'd3'], 'd2'));
		expect(firstScheduledDayIndex(view)).toBe(1);
	});

	it('stays on the first day when nothing is scheduled', () => {
		const view = buildView(conference(['d1', 'd2'], null));
		expect(firstScheduledDayIndex(view)).toBe(0);
	});
});

/**
 * A conference may be published before anyone has settled on a date (#492).
 *
 * The column is nullable, the type used to claim otherwise, and the loader
 * papered over it with `?? ''` — so this formatter reached `new Date('')` and
 * threw a RangeError on the header of every inner page. The whole public site
 * answered 500 while the organizer view said "Published".
 */
describe('formatDateRange', () => {
	it('says nothing at all when there is no start date', () => {
		expect(formatDateRange({ startsOn: null, endsOn: null })).toBeNull();
	});

	it('names the start day rather than throw when only the end date is missing', () => {
		expect(formatDateRange({ startsOn: '2027-06-02', endsOn: null })).toBe(
			'Wednesday, 2 June 2027'
		);
	});

	it('names one day for a one-day conference and both ends otherwise', () => {
		expect(formatDateRange({ startsOn: '2027-06-02', endsOn: '2027-06-02' })).toBe(
			'Wednesday, 2 June 2027'
		);
		expect(formatDateRange({ startsOn: '2027-06-02', endsOn: '2027-06-04' })).toBe(
			'Wednesday, 2 June 2027 – Friday, 4 June 2027'
		);
	});
});

describe('watchableRecordingUrl', () => {
	const url = 'https://www.youtube.com/watch?v=ju73sWVtvU0';
	const talk = { recordingUrl: url, endsAt: '2026-08-16T12:00:00.000Z' };

	it('is the pasted URL once the talk has ended, and gone when the same end is pushed into the future', () => {
		const now = new Date('2026-08-16T12:00:00.000Z');
		expect(watchableRecordingUrl(talk, now)).toBe(url);
		expect(watchableRecordingUrl({ ...talk, endsAt: '2027-05-12T10:00:00.000Z' }, now)).toBeNull();
	});

	it('stays hidden when there is no recording, even after the talk', () => {
		expect(
			watchableRecordingUrl(
				{ recordingUrl: null, endsAt: '2026-08-16T12:00:00.000Z' },
				new Date('2026-08-16T12:00:00.000Z')
			)
		).toBeNull();
	});
});
