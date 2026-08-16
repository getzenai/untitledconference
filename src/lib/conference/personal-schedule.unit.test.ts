/**
 * What the attendee's *Add to calendar* hands over (#821, #822).
 *
 * The button had no test at all, and the file it produced was a second, softer
 * copy of `ical.ts`: unfolded lines, a DTSTAMP that was the talk's own start, and
 * `…Z` times that every calendar outside UTC moved. These cases hold the two
 * halves that matter — the mapping this module owns, and the fact that the bytes
 * are the other module's job.
 */
import { describe, expect, it } from 'vitest';
import { icalFile } from './ical';
import { scheduleEvents } from './personal-schedule.svelte';
import type { ResolvedSession } from './public-view';

const NOW = new Date('2026-08-16T18:00:00.000Z');

const session = {
	id: '2',
	title: 'Your build is slow because of four things',
	description:
		'Build times decay for boringly consistent reasons. We instrumented ours for a year; this is what we found, in order of how much time each cost, and what fixing them actually took.',
	room: 'Room 2A',
	start: new Date('2027-05-12T11:00:00.000Z'),
	end: new Date('2027-05-12T11:30:00.000Z')
} as unknown as ResolvedSession;

const file = () => icalFile('DevFlow Conf 2027', scheduleEvents([session]), NOW);
const lines = () => file().split('\r\n');

describe('the starred sessions as calendar events', () => {
	it('carries the fields the itinerary shows', () => {
		expect(scheduleEvents([session])).toEqual([
			{
				uid: '2@untitledconference',
				start: session.start,
				end: session.end,
				summary: session.title,
				description: session.description,
				location: session.room
			}
		]);
	});

	/**
	 * The same UID the subscription feed writes, on purpose: a reader who both
	 * subscribes and exports should end up with one entry per talk.
	 */
	it('names an event the way the feed names it', () => {
		expect(scheduleEvents([session])[0].uid).toBe('2@untitledconference');
	});
});

describe('the exported file', () => {
	it('gives the page and the calendar the same clock (#821)', () => {
		// The itinerary shows this session at 11:00, in every viewer's zone.
		expect(lines()).toContain('DTSTART:20270512T110000');
		expect(lines()).toContain('DTEND:20270512T113000');
		expect(file()).not.toContain('DTSTART:20270512T110000Z');
	});

	it('stamps when it was written, not when the talk starts', () => {
		expect(lines()).toContain('DTSTAMP:20260816T180000Z');
	});

	/**
	 * The abstract above is 190 octets on one line, which is what the old builder
	 * shipped: RFC 5545 §3.1 stops at 75, and the importers that enforce it are
	 * the ones that say nothing useful when they refuse.
	 */
	it('folds every line to 75 octets and ends the file with CRLF (#822)', () => {
		const written = file();
		const encoder = new TextEncoder();
		for (const line of written.split('\r\n')) {
			expect(encoder.encode(line).length, line.slice(0, 40)).toBeLessThanOrEqual(75);
		}
		expect(written.endsWith('\r\n')).toBe(true);
		// The control: the case only means something if a line was long enough to
		// need folding in the first place.
		expect(encoder.encode(`DESCRIPTION:${session.description}`).length).toBeGreaterThan(75);
	});

	it('escapes what would otherwise end the value, and publishes rather than invites', () => {
		expect(file()).toContain('this is what we found\\, in order');
		expect(lines()).toContain('METHOD:PUBLISH');
	});
});
