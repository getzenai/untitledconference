import { describe, expect, it } from 'vitest';
import {
	applyBoardWrites,
	involvedPlacementIds,
	slotEditorWrite,
	type BoardWrite,
	type OptimisticSession
} from './agenda-optimistic';

const session = (
	over: Partial<OptimisticSession> & { placementId: number }
): OptimisticSession => ({
	minutes: 30,
	dayId: 1,
	roomId: 1,
	startMinutes: 9 * 60,
	endMinutes: 9 * 60 + 30,
	status: 'tentative',
	...over
});

const board = (
	placed: OptimisticSession[] = [],
	tray: OptimisticSession[] = [],
	conflicts = [{ kind: 'room', detail: 'do not invent me' }]
) => ({ placed, tray, conflicts, rooms: [{ id: 1 }] });

describe('applyBoardWrites', () => {
	it('moves a tray talk onto the slot and leaves it out of the tray', () => {
		const talk = session({
			placementId: 7,
			dayId: null,
			roomId: null,
			startMinutes: null,
			endMinutes: null
		});
		const next = applyBoardWrites(board([], [talk]), [
			{ kind: 'place', placementId: 7, dayId: 1, roomId: 2, startMinutes: 14 * 60 + 30 }
		]);

		expect(next.tray).toEqual([]);
		expect(next.placed).toEqual([
			session({
				placementId: 7,
				dayId: 1,
				roomId: 2,
				startMinutes: 14 * 60 + 30,
				endMinutes: 15 * 60
			})
		]);
	});

	it('moves a placed talk and keeps its length', () => {
		const talk = session({
			placementId: 3,
			minutes: 45,
			startMinutes: 9 * 60,
			endMinutes: 9 * 60 + 45
		});
		const next = applyBoardWrites(board([talk]), [
			{ kind: 'place', placementId: 3, dayId: 1, roomId: 4, startMinutes: 11 * 60 }
		]);

		expect(next.placed[0]).toMatchObject({
			placementId: 3,
			roomId: 4,
			startMinutes: 11 * 60,
			endMinutes: 11 * 60 + 45
		});
	});

	it('is a no-op when the placement is gone — a dropped connection must not invent a card', () => {
		const next = applyBoardWrites(board(), [
			{ kind: 'place', placementId: 99, dayId: 1, roomId: 1, startMinutes: 600 }
		]);
		expect(next.placed).toEqual([]);
		expect(next.tray).toEqual([]);
	});

	it('takes a talk off the grid and back into the tray as a draft', () => {
		const talk = session({ placementId: 4, status: 'confirmed' });
		const next = applyBoardWrites(board([talk]), [{ kind: 'unplace', placementId: 4 }]);

		expect(next.placed).toEqual([]);
		expect(next.tray).toEqual([
			session({
				placementId: 4,
				status: 'tentative',
				dayId: null,
				roomId: null,
				startMinutes: null,
				endMinutes: null
			})
		]);
	});

	it('swaps starts and rooms without inheriting the other talk’s length', () => {
		const short = session({
			placementId: 1,
			minutes: 30,
			roomId: 1,
			startMinutes: 9 * 60,
			endMinutes: 9 * 60 + 30
		});
		const long = session({
			placementId: 2,
			minutes: 45,
			roomId: 2,
			startMinutes: 10 * 60,
			endMinutes: 10 * 60 + 45
		});
		const next = applyBoardWrites(board([short, long]), [
			{ kind: 'swap', placementId: 1, withPlacementId: 2 }
		]);

		expect(next.placed.find((s) => s.placementId === 1)).toMatchObject({
			roomId: 2,
			startMinutes: 10 * 60,
			endMinutes: 10 * 60 + 30
		});
		expect(next.placed.find((s) => s.placementId === 2)).toMatchObject({
			roomId: 1,
			startMinutes: 9 * 60,
			endMinutes: 9 * 60 + 45
		});
	});

	it('applies two places of the same talk in order', () => {
		const talk = session({ placementId: 1, startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 });
		const writes: BoardWrite[] = [
			{ kind: 'place', placementId: 1, dayId: 1, roomId: 1, startMinutes: 11 * 60 },
			{ kind: 'place', placementId: 1, dayId: 1, roomId: 2, startMinutes: 14 * 60 }
		];
		const next = applyBoardWrites(board([talk]), writes);

		expect(next.placed[0]).toMatchObject({ roomId: 2, startMinutes: 14 * 60 });
	});

	it('does not touch conflicts — those wait for the server', () => {
		const talk = session({ placementId: 1 });
		const before = board([talk]);
		const next = applyBoardWrites(before, [
			{ kind: 'place', placementId: 1, dayId: 1, roomId: 2, startMinutes: 600 }
		]);

		expect(next.conflicts).toBe(before.conflicts);
		expect(next.rooms).toBe(before.rooms);
	});

	it('rolling a write off the list restores the server board', () => {
		const talk = session({ placementId: 1 });
		const start = board([talk]);
		const write: BoardWrite = {
			kind: 'place',
			placementId: 1,
			dayId: 1,
			roomId: 2,
			startMinutes: 12 * 60
		};

		expect(applyBoardWrites(start, [write]).placed[0].roomId).toBe(2);
		expect(applyBoardWrites(start, []).placed[0].roomId).toBe(1);
	});
});

describe('slotEditorWrite', () => {
	it('paints a tray place, an unplace and a swap, and refuses a copy it cannot id', () => {
		expect(
			slotEditorWrite('place', { placementId: 1, dayId: 1, roomId: 2, startMinutes: 600 }, 'tray')
		).toEqual({ kind: 'place', placementId: 1, dayId: 1, roomId: 2, startMinutes: 600 });
		expect(slotEditorWrite('unplace', { placementId: 1 }, 'grid')).toEqual({
			kind: 'unplace',
			placementId: 1
		});
		expect(slotEditorWrite('swap', { placementId: 1, withPlacementId: 2 }, 'grid')).toEqual({
			kind: 'swap',
			placementId: 1,
			withPlacementId: 2
		});
		// Already on the grid: the server will insert a new row. No local id.
		expect(
			slotEditorWrite('place', { placementId: 1, dayId: 1, roomId: 2, startMinutes: 600 }, 'grid')
		).toBeNull();
	});
});

describe('involvedPlacementIds', () => {
	it('marks both halves of a swap as saving', () => {
		expect(involvedPlacementIds({ kind: 'unplace', placementId: 4 })).toEqual([4]);
		expect(involvedPlacementIds({ kind: 'swap', placementId: 1, withPlacementId: 2 })).toEqual([
			1, 2
		]);
	});
});
