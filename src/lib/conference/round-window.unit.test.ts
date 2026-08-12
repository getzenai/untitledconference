/**
 * The one place that decides whether a review round is taking answers (ABS-01).
 *
 * The queue, the scorecard and `saveReview` all ask it, so the boundaries are pinned
 * here rather than three times in three tests: an unset date is not a shut round, the
 * closing second is exclusive, and a reviewer who holds a talk in two rounds is told
 * about the one that still wants work.
 */
import { describe, expect, it } from 'vitest';
import {
	combineRoundWindows,
	roundWindow,
	roundWindowLabel,
	roundWindowNotice,
	roundWindowState
} from './round-window';

const DAY = 86_400_000;
const now = new Date('2027-03-10T12:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe('roundWindowState', () => {
	it('treats a round with no dates as open', () => {
		expect(roundWindowState(null, null, now)).toBe('open');
	});

	it('is not open before opensAt and open from the instant it arrives', () => {
		expect(roundWindowState(at(1), null, now)).toBe('not_yet_open');
		// Inclusive of the opening instant, like the call for papers' own window.
		expect(roundWindowState(now, null, now)).toBe('open');
	});

	it('is closed from the closing instant on', () => {
		expect(roundWindowState(null, at(1), now)).toBe('open');
		// Exclusive of the closing instant: a round that closes at 17:00 takes
		// nothing at 17:00.
		expect(roundWindowState(null, now, now)).toBe('closed');
		expect(roundWindowState(null, at(-1), now)).toBe('closed');
	});

	it('reads ISO strings the same as Dates — the loader may have serialised them', () => {
		expect(roundWindowState(at(DAY).toISOString(), null, now)).toBe('not_yet_open');
		expect(roundWindowState(null, at(-DAY).toISOString(), now)).toBe('closed');
	});

	it('answers not_yet_open first when a round has not started and already ended', () => {
		// `roundProblem` rejects closes <= opens on save, so this only reaches here
		// through data written before that guard. "Not open yet" is the safer of the
		// two: both refuse the POST, and neither invites work.
		expect(roundWindowState(at(DAY), at(-DAY), now)).toBe('not_yet_open');
	});
});

describe('the wording that replaces the form', () => {
	it('names the state first and counts the days from the server', () => {
		expect(roundWindowNotice(roundWindow(at(2 * DAY), null, now), now)).toContain(
			'opens in 2 days'
		);
		expect(roundWindowNotice(roundWindow(at(DAY), null, now), now)).toContain('opens tomorrow');
		expect(roundWindowNotice(roundWindow(at(-DAY), null, now), now)).toBeNull();
		expect(roundWindowNotice(roundWindow(null, at(-DAY), now), now)).toContain(
			'Reviews can no longer be filed or changed.'
		);
	});

	it('still says why when only the state is known', () => {
		expect(roundWindowNotice({ state: 'not_yet_open', opensAt: null, closesAt: null }, now)).toBe(
			'This review round has not opened yet.'
		);
		expect(roundWindowNotice({ state: 'closed', opensAt: null, closesAt: null }, now)).toBe(
			'This review round is closed.'
		);
	});

	it('labels a badge in two or three words', () => {
		expect(roundWindowLabel(roundWindow(null, null, now), now)).toBe('Open');
		expect(roundWindowLabel(roundWindow(null, at(-DAY), now), now)).toBe('Closed');
		expect(roundWindowLabel(roundWindow(at(2 * DAY), null, now), now)).toBe('Opens in 2 days');
		expect(roundWindowLabel({ state: 'not_yet_open', opensAt: null, closesAt: null }, now)).toBe(
			'Not open yet'
		);
	});

	it('carries its own wording, so no component counts days in the reader’s zone', () => {
		const window = roundWindow(at(2 * DAY), null, now);
		expect(window.label).toBe('Opens in 2 days');
		expect(window.notice).toContain('opens in 2 days');
		expect(roundWindow(null, null, now).notice).toBeNull();
	});
});

describe('combineRoundWindows', () => {
	const open = roundWindow(null, null, now);
	const soon = roundWindow(at(DAY), null, now);
	const closed = roundWindow(null, at(-DAY), now);

	it('is open when nothing is known — a submission in no round asks nothing of nobody', () => {
		expect(combineRoundWindows([]).state).toBe('open');
	});

	it('lets the round that still wants work win', () => {
		expect(combineRoundWindows([closed, open]).state).toBe('open');
		expect(combineRoundWindows([closed, soon]).state).toBe('not_yet_open');
		expect(combineRoundWindows([closed]).state).toBe('closed');
	});
});
