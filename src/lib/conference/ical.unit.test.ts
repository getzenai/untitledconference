/**
 * The iCalendar rules, checked one at a time.
 *
 * Every case here is one that produces a file a calendar either refuses with an
 * unhelpful message or, worse, imports and shows as something other than what we
 * wrote — the only two failure modes this module has.
 */
import { describe, expect, it } from 'vitest';
import { foldIcalLine, icalFile, icalText, type CalendarEvent } from './ical';

const NOW = new Date('2026-08-12T20:00:00.000Z');

const session: CalendarEvent = {
	uid: 'sess-1@untitledconference',
	start: new Date('2027-04-15T09:30:00.000Z'),
	end: new Date('2027-04-15T10:15:00.000Z'),
	summary: 'Four hundred engineers, one repository',
	description: 'Ada Lovelace',
	location: 'Main hall'
};

describe('a text value', () => {
	it('leaves an ordinary value alone', () => {
		expect(icalText('Serving 70B models on a budget')).toBe('Serving 70B models on a budget');
	});

	it('escapes the three characters that would end the value or start a new one', () => {
		expect(icalText('Testing, briefly')).toBe('Testing\\, briefly');
		expect(icalText('Batching; a retrospective')).toBe('Batching\\; a retrospective');
		expect(icalText('C:\\builds')).toBe('C:\\\\builds');
	});

	it('leaves the colon alone', () => {
		// Escaping it is the single most common way to make a phone show the
		// backslash: a colon is an ordinary character inside a value.
		expect(icalText('Batching: a retrospective')).toBe('Batching: a retrospective');
	});

	it('escapes the backslash before it escapes anything else', () => {
		// The other order yields `\\,` — a literal backslash followed by a field
		// separator, which cuts the value in half.
		expect(icalText('a\\, b')).toBe('a\\\\\\, b');
	});

	it('turns every flavour of newline into one escape', () => {
		expect(icalText('line one\r\nline two')).toBe('line one\\nline two');
		expect(icalText('line one\rline two')).toBe('line one\\nline two');
		expect(icalText('line one\nline two')).toBe('line one\\nline two');
	});

	it('drops a control character rather than escaping it', () => {
		// A stray control byte in a stored abstract would otherwise survive into the
		// file, where the strict importers reject the whole calendar.
		expect(icalText('a\u0000b\u0007c\u007fd')).toBe('abcd');
		// Tab stays: the format allows it inside a value.
		expect(icalText('a\tb')).toBe('a\tb');
	});
});

describe('folding', () => {
	it('leaves a line that fits alone', () => {
		expect(foldIcalLine('SUMMARY:short')).toBe('SUMMARY:short');
	});

	it('breaks at 75 octets and prefixes the continuation with a space', () => {
		const line = `SUMMARY:${'a'.repeat(100)}`;
		const parts = foldIcalLine(line).split('\r\n');

		expect(parts).toHaveLength(2);
		expect(parts[0]).toHaveLength(75);
		expect(parts[1].startsWith(' ')).toBe(true);
		// Unfolding — drop the CRLF and the one space after it — gives back the input.
		expect(parts.join('').replace(/^(.{75})\s/, '$1')).toBe(line);
	});

	it('counts octets, not characters, and never splits one in half', () => {
		// 40 four-byte characters is 160 octets but only 40 `length`, so a fold placed
		// by character count would emit a single 160-octet line.
		const line = `SUMMARY:${'😀'.repeat(40)}`;
		const encoder = new TextEncoder();

		for (const part of foldIcalLine(line).split('\r\n')) {
			expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
			// A cut through a surrogate pair arrives as U+FFFD.
			expect(part).not.toContain('\ufffd');
		}
	});
});

describe('a calendar file', () => {
	const file = icalFile('DevFlow Conf 2027 — Agenda', [session], NOW);
	const lines = file.split('\r\n');

	it('ends every line with CRLF, the last one included', () => {
		expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(file.includes('\n\n')).toBe(false);
		// A bare LF anywhere would end a content line for half the readers and not
		// the other half.
		expect(/[^\r]\n/.test(file)).toBe(false);
	});

	it('opens and closes the calendar and the event', () => {
		expect(lines[0]).toBe('BEGIN:VCALENDAR');
		expect(lines).toContain('BEGIN:VEVENT');
		expect(lines).toContain('END:VEVENT');
		expect(lines).toContain('END:VCALENDAR');
	});

	it('writes UTC timestamps in the one shape the format has', () => {
		expect(lines).toContain('DTSTART:20270415T093000Z');
		expect(lines).toContain('DTEND:20270415T101500Z');
		expect(lines).toContain('DTSTAMP:20260812T200000Z');
	});

	it('publishes rather than invites', () => {
		// REQUEST would put Accept/Decline on every talk and mail the answers back.
		expect(lines).toContain('METHOD:PUBLISH');
	});

	it('carries the event through', () => {
		expect(lines).toContain('UID:sess-1@untitledconference');
		expect(lines).toContain('SUMMARY:Four hundred engineers\\, one repository');
		expect(lines).toContain('LOCATION:Main hall');
		expect(lines).toContain('DESCRIPTION:Ada Lovelace');
	});

	it('omits a property it has no value for rather than writing an empty one', () => {
		const bare = icalFile('Agenda', [{ ...session, description: null, location: null }], NOW);
		expect(bare).not.toContain('DESCRIPTION');
		expect(bare).not.toContain('LOCATION');
	});

	it('does not escape a URL', () => {
		// A URI value is not TEXT: escaping the commas in a query string would break
		// the link it points at.
		const withUrl = icalFile('Agenda', [{ ...session, url: 'https://x.test/c/a?b=1,2' }], NOW);
		expect(withUrl).toContain('URL:https://x.test/c/a?b=1,2');
	});

	it('renders an empty programme as a valid, empty calendar', () => {
		// A conference with nothing scheduled yet is a normal state, and a subscriber
		// who gets a 500 for it unsubscribes.
		const empty = icalFile('Agenda', [], NOW);
		expect(empty).toContain('BEGIN:VCALENDAR');
		expect(empty).not.toContain('BEGIN:VEVENT');
	});
});
