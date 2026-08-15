/**
 * The public agenda's room columns come from the day's sessions, not from
 * every room the organizer ever created (#561).
 */
import { describe, expect, it } from 'vitest';
import { agendaGridColumns, occupiedRoomsForDay, sessionColumnSpan } from './public-agenda-columns';

const rooms = [
	{ id: 'a', name: 'Hall A' },
	{ id: 'b', name: 'Hall B' },
	{ id: 'c', name: 'Unused' }
];

const talk = (roomId: string | null) => ({ roomId });

describe('occupiedRoomsForDay', () => {
	it('drops a room that has no talk on the day', () => {
		expect(occupiedRoomsForDay(rooms, [talk('a'), talk('b')])).toEqual([
			{ id: 'a', name: 'Hall A' },
			{ id: 'b', name: 'Hall B' }
		]);
	});

	it('keeps the organizer order, not the order talks appear', () => {
		expect(occupiedRoomsForDay(rooms, [talk('b'), talk('a')]).map((r) => r.id)).toEqual(['a', 'b']);
	});

	it('does not let a room used only on another day widen this one', () => {
		const day1 = [talk('a')];
		const day2 = [talk('a'), talk('c')];

		expect(occupiedRoomsForDay(rooms, day1).map((r) => r.id)).toEqual(['a']);
		expect(occupiedRoomsForDay(rooms, day2).map((r) => r.id)).toEqual(['a', 'c']);
	});

	it('creates no column from a room-less session', () => {
		expect(occupiedRoomsForDay(rooms, [talk(null), talk(null)])).toEqual([]);
	});

	it('ignores a session whose room is not on the conference list', () => {
		expect(occupiedRoomsForDay(rooms, [talk('ghost')])).toEqual([]);
	});
});

describe('sessionColumnSpan', () => {
	const occupied = [rooms[0], rooms[1]];

	it("sits a roomed talk in that room's column", () => {
		expect(sessionColumnSpan(talk('b'), occupied)).toEqual({ start: 3, end: 4 });
	});

	it('spans a room-less session across every occupied column', () => {
		expect(sessionColumnSpan(talk(null), occupied)).toEqual({ start: 2, end: 4 });
	});

	it('still gives a plenary-only day one column to sit in', () => {
		expect(sessionColumnSpan(talk(null), [])).toEqual({ start: 2, end: 3 });
	});
});

describe('agendaGridColumns', () => {
	it('asks for one track per occupied room, never fewer than one', () => {
		expect(agendaGridColumns(31)).toBe('4.5rem repeat(31, minmax(9rem, 1fr))');
		expect(agendaGridColumns(0)).toBe('4.5rem repeat(1, minmax(9rem, 1fr))');
	});
});
