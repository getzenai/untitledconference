/**
 * The close date as a VEVENT, pinned to one instant (#510).
 *
 * 12 September 2026, 23:59 EDT is 13 September 03:59 UTC. The file must carry
 * that UTC instant — not the printed day, not a floating local time — so a
 * reader in New York and a reader in Berlin both land on the evening the call
 * actually ends.
 */
import { describe, expect, it } from 'vitest';
import {
	CFP_DEADLINE_MINUTES,
	cfpDeadlineCalendar,
	cfpDeadlineEvent,
	cfpDeadlineFilename,
	cfpDeadlinePath,
	namedCall
} from './cfp-deadline';

const NOW = new Date('2026-08-14T20:00:00.000Z');
// 12 September 2026, 23:59 EDT (UTC−4).
const CLOSES_AT = new Date('2026-09-13T03:59:00.000Z');
const DEADLINE = {
	formId: 7,
	conferenceName: 'DevFlow Conf 2027',
	formTitle: 'Call for papers',
	closesAt: CLOSES_AT,
	url: 'https://untitled.test/c/devflow-conf-2027/cfp'
};

describe('the CFP deadline as a calendar event', () => {
	const file = cfpDeadlineCalendar(DEADLINE, NOW);
	const lines = file.split('\r\n');

	it('pins DTSTART and DTEND to the known instant, in UTC', () => {
		// A 15-minute block ending at the close, not a zero-length stamp some
		// calendars drop from the day view.
		expect(CFP_DEADLINE_MINUTES).toBe(15);
		expect(lines).toContain('DTEND:20260913T035900Z');
		expect(lines).toContain('DTSTART:20260913T034400Z');
		expect(lines).toContain('DTSTAMP:20260814T200000Z');
	});

	it('writes one VEVENT, named after the conference and the call', () => {
		expect(file.split('BEGIN:VEVENT').length - 1).toBe(1);
		expect(lines).toContain('SUMMARY:DevFlow Conf 2027 — Call for papers closes');
		expect(lines).toContain('X-WR-CALNAME:DevFlow Conf 2027 — Call for papers');
		expect(lines).toContain('UID:cfp-7@untitledconference');
	});

	it('links back to the public CFP page', () => {
		expect(lines).toContain('URL:https://untitled.test/c/devflow-conf-2027/cfp');
	});

	it('builds the event from the same instant the file stamps', () => {
		const event = cfpDeadlineEvent(DEADLINE);
		expect(event.end).toEqual(CLOSES_AT);
		expect(event.start.getTime()).toBe(CLOSES_AT.getTime() - 15 * 60 * 1000);
	});

	it('names the download after the conference and the call', () => {
		expect(cfpDeadlineFilename('DevFlow Conf 2027', 'Call for papers')).toBe(
			'DevFlow-Conf-2027-Call-for-papers.ics'
		);
		expect(cfpDeadlinePath('devflow-conf-2027')).toBe('/c/devflow-conf-2027/cfp.ics');
	});
});

describe('namedCall — the conference name once', () => {
	it('puts the name in front of a title that does not already carry it', () => {
		expect(namedCall('DevFlow Conf 2027', 'Call for papers')).toBe(
			'DevFlow Conf 2027 — Call for papers'
		);
	});

	it('leaves a default title that already carries the name alone', () => {
		expect(namedCall('DevFlow Conf 2027', 'DevFlow Conf 2027 — Call for papers')).toBe(
			'DevFlow Conf 2027 — Call for papers'
		);
	});

	it('uses the same label for SUMMARY, calendar name and filename', () => {
		const defaulted = {
			...DEADLINE,
			formTitle: 'DevFlow Conf 2027 — Call for papers'
		};
		const lines = cfpDeadlineCalendar(defaulted, NOW).split('\r\n');

		expect(lines).toContain('SUMMARY:DevFlow Conf 2027 — Call for papers closes');
		expect(lines).toContain('X-WR-CALNAME:DevFlow Conf 2027 — Call for papers');
		expect(cfpDeadlineFilename(defaulted.conferenceName, defaulted.formTitle)).toBe(
			'DevFlow-Conf-2027-Call-for-papers.ics'
		);
	});
});
