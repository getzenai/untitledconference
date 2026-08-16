/**
 * The arithmetic behind the three things Fabian saw on a short-slot agenda
 * (#588): text cut through the glyphs, two talks drawn on top of each other,
 * and a gutter that started at 09:05.
 */
import { describe, expect, it } from 'vitest';
import {
	assignLanes,
	cardDensity,
	cardHeightPx,
	cardSubtitle,
	floorToLabel,
	laneStyle
} from './public-agenda-layout';

const at = (hhmm: string) => new Date(`2027-06-01T${hhmm}:00.000Z`);
const session = (id: string, roomId: string | null, from: string, to: string) => ({
	id,
	roomId,
	start: at(from),
	end: at(to)
});

describe('card height', () => {
	it('counts the gaps a spanning card swallows and the 1px inset it pays', () => {
		expect(cardHeightPx(1)).toBe(22);
		expect(cardHeightPx(2)).toBe(47);
		expect(cardHeightPx(4)).toBe(97);
	});

	it('leaves a one-row card less room than one line of text-sm needs', () => {
		// 17.5px of line plus 8px of p-1 against 22px of card: this is the
		// deficit, and it is why a one-row card is its own density.
		expect(cardHeightPx(1)).toBeLessThan(17.5 + 8);
	});
});

describe('card density', () => {
	it('gives a quarter-hour card one small line, a half hour two, longer the full card', () => {
		expect(cardDensity(1)).toBe('tiny');
		expect(cardDensity(2)).toBe('compact');
		expect(cardDensity(3)).toBe('full');
		expect(cardDensity(8)).toBe('full');
	});

	it('never returns a denser card than the height allows, whatever the caller passes', () => {
		expect(cardDensity(0)).toBe('tiny');
	});
});

describe('card subtitle', () => {
	it('puts the speaker on a full card, not track and format', () => {
		expect(cardSubtitle('full', 'Ada Lovelace', 'Platform · Talk')).toBe('Ada Lovelace');
	});

	it('keeps track and format on a full card that has no speaker', () => {
		expect(cardSubtitle('full', '', 'Platform · Talk')).toBe('Platform · Talk');
	});

	it('leaves compact and tiny with no second line, speaker or not', () => {
		expect(cardSubtitle('compact', 'Ada Lovelace', 'Platform · Talk')).toBe('');
		expect(cardSubtitle('tiny', 'Ada Lovelace', 'Platform · Talk')).toBe('');
		expect(cardSubtitle('compact', '', 'Platform · Talk')).toBe('');
		expect(cardSubtitle('tiny', '', 'Platform · Talk')).toBe('');
	});
});

describe('gutter floor', () => {
	it('rounds the first line down to the previous half hour', () => {
		expect(floorToLabel(at('09:05').getTime(), 30)).toBe(at('09:00').getTime());
		expect(floorToLabel(at('09:35').getTime(), 30)).toBe(at('09:30').getTime());
	});

	it('leaves a round start where it is, so a tidy day does not grow a row', () => {
		expect(floorToLabel(at('09:00').getTime(), 30)).toBe(at('09:00').getTime());
	});
});

describe('lanes', () => {
	it('leaves a room without overlaps alone — one lane, no width change', () => {
		const lanes = assignLanes([
			session('a', 'r1', '09:00', '09:30'),
			session('b', 'r1', '09:30', '10:00')
		]);

		expect(lanes.get('a')).toEqual({ lane: 0, lanes: 1 });
		expect(laneStyle(lanes.get('a'))).toBeNull();
	});

	it('splits a room column between two talks that share a minute', () => {
		const lanes = assignLanes([
			session('a', 'r1', '09:00', '10:00'),
			session('b', 'r1', '09:50', '10:20')
		]);

		expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
		expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
	});

	it('keeps the earlier talk on the left', () => {
		const lanes = assignLanes([
			session('late', 'r1', '09:50', '10:20'),
			session('early', 'r1', '09:00', '10:00')
		]);

		expect(lanes.get('early')?.lane).toBe(0);
		expect(lanes.get('late')?.lane).toBe(1);
	});

	it('reuses a lane once its talk has ended, so a chain of two-and-two stays two wide', () => {
		const lanes = assignLanes([
			session('a', 'r1', '09:00', '10:00'),
			session('b', 'r1', '09:30', '10:30'),
			session('c', 'r1', '10:00', '11:00')
		]);

		// Three talks, but never three at once: the column is cut in two and `c`
		// takes back the lane `a` has left. Cutting by cluster size instead would
		// waste a third of the width on a gap nobody is standing in.
		expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 });
		expect(lanes.get('b')?.lanes).toBe(2);
	});

	it('does not let one room widen another', () => {
		const lanes = assignLanes([
			session('a', 'r1', '09:00', '10:00'),
			session('b', 'r1', '09:30', '10:30'),
			session('c', 'r2', '09:00', '10:00')
		]);

		expect(lanes.get('c')).toEqual({ lane: 0, lanes: 1 });
	});

	it('ignores room-less sessions: a plenary spans the day, it does not clash', () => {
		const lanes = assignLanes([
			session('plenary', null, '09:00', '10:00'),
			session('a', 'r1', '09:00', '10:00')
		]);

		expect(lanes.has('plenary')).toBe(false);
		expect(lanes.get('a')?.lanes).toBe(1);
	});

	it('touching talks do not overlap: 09:30 starts where 09:30 ends', () => {
		const lanes = assignLanes([
			session('a', 'r1', '09:00', '09:30'),
			session('b', 'r1', '09:30', '10:00')
		]);

		expect(lanes.get('b')?.lanes).toBe(1);
	});
});

describe('lane style', () => {
	it('measures in percent of the room column, so it survives 1fr and 9rem alike', () => {
		expect(laneStyle({ lane: 1, lanes: 2 })).toBe(
			'width: calc(100% / 2 - 2px); margin-left: calc(100% * 1 / 2 + 1px); margin-right: 0;'
		);
	});
});
