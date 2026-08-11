import { describe, expect, it } from 'vitest';
import { blockRows, dropTarget, gridSlots, laneLayout, type GridFrame } from './agenda-grid';

const DAY = { dayStartsAt: 9 * 60, dayEndsAt: 18 * 60, slotMinutes: 15 };

const frame = (rooms: number[], slots: number[]): GridFrame => ({
	rooms,
	slots,
	slotMinutes: 15
});

describe('gridSlots', () => {
	it('covers the working day in quarter hours', () => {
		const slots = gridSlots({ ...DAY, sessions: [] });

		expect(slots[0]).toBe(9 * 60);
		expect(slots.at(-1)).toBe(17 * 60 + 45);
		expect(slots).toHaveLength(36);
	});

	// The failure this guards is silent: a session outside the working day would
	// simply not be drawn, so the organizer sees an empty room and the agenda is
	// wrong in the one direction nobody checks.
	it('widens for a session that starts before the day does', () => {
		const slots = gridSlots({
			...DAY,
			sessions: [{ startMinutes: 8 * 60, endMinutes: 8 * 60 + 30 }]
		});

		expect(slots[0]).toBe(8 * 60);
		expect(slots.at(-1)).toBe(17 * 60 + 45);
	});

	it('widens for a session that runs past the end of the day', () => {
		const slots = gridSlots({
			...DAY,
			sessions: [{ startMinutes: 17 * 60 + 45, endMinutes: 19 * 60 }]
		});

		expect(slots.at(-1)).toBe(18 * 60 + 45);
	});

	// Snapping outwards rather than to the nearest step: a row that begins after
	// the session it is meant to contain puts the block above the frame.
	it('snaps an off-step start down to a whole slot', () => {
		const slots = gridSlots({
			...DAY,
			sessions: [{ startMinutes: 8 * 60 + 52, endMinutes: 9 * 60 + 22 }]
		});

		expect(slots[0]).toBe(8 * 60 + 45);
	});

	it('never narrows below the working day for a short one-session day', () => {
		const slots = gridSlots({
			...DAY,
			sessions: [{ startMinutes: 12 * 60, endMinutes: 12 * 60 + 30 }]
		});

		expect(slots[0]).toBe(9 * 60);
		expect(slots.at(-1)).toBe(17 * 60 + 45);
	});
});

describe('blockRows', () => {
	const day = frame([1, 2], gridSlots({ ...DAY, sessions: [] }));

	it('gives a 30-minute talk twice the rows of a 15-minute one', () => {
		expect(blockRows(day, { startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 })).toEqual({
			row: 1,
			span: 2
		});
		expect(blockRows(day, { startMinutes: 9 * 60, endMinutes: 9 * 60 + 15 })).toEqual({
			row: 1,
			span: 1
		});
	});

	it('places a later start further down by exactly its offset', () => {
		expect(blockRows(day, { startMinutes: 10 * 60, endMinutes: 10 * 60 + 45 })).toEqual({
			row: 5,
			span: 3
		});
	});

	// 45 minutes at quarter-hour rows is the case that made the public agenda pick
	// this granularity: at half-hour rows it rounds up to an hour and reads as
	// running into the next talk.
	it('does not round a 45-minute block up to an hour', () => {
		const { span } = blockRows(day, { startMinutes: 11 * 60, endMinutes: 11 * 60 + 45 })!;
		expect(span).toBe(3);
	});

	it('keeps a session with no end time one row tall rather than none', () => {
		expect(blockRows(day, { startMinutes: 9 * 60, endMinutes: null })).toEqual({
			row: 1,
			span: 1
		});
	});

	it('has nothing to draw for a session with no start', () => {
		expect(blockRows(day, { startMinutes: null, endMinutes: null })).toBeNull();
	});

	it('stops a block at the last row instead of drawing past the frame', () => {
		const { row, span } = blockRows(day, { startMinutes: 17 * 60 + 45, endMinutes: 19 * 60 })!;

		expect(row).toBe(36);
		expect(row + span).toBeLessThanOrEqual(day.slots.length + 1);
	});
});

describe('laneLayout', () => {
	const talk = (title: string, start: number, minutes = 30) => ({
		title,
		startMinutes: start,
		endMinutes: start + minutes
	});

	it('leaves sessions that follow each other full width', () => {
		const laid = laneLayout([talk('A', 540), talk('B', 570), talk('C', 600)]);

		expect(laid.map((l) => [l.session.title, l.lane, l.lanes])).toEqual([
			['A', 0, 1],
			['B', 0, 1],
			['C', 0, 1]
		]);
	});

	// The clash the grid exists to show. Drawn in one lane, the second block would
	// sit exactly on top of the first and a double-booking would look like a single
	// talk.
	it('puts two overlapping sessions side by side', () => {
		const laid = laneLayout([talk('A', 540), talk('B', 555)]);

		expect(laid.map((l) => [l.session.title, l.lane, l.lanes])).toEqual([
			['A', 0, 2],
			['B', 1, 2]
		]);
	});

	// One clash at nine o'clock must not halve the width of a talk at four, or a
	// single mistake would redraw the whole day.
	it('narrows only the cluster that overlaps', () => {
		const laid = laneLayout([talk('A', 540), talk('B', 555), talk('Later', 960)]);

		expect(laid.find((l) => l.session.title === 'Later')).toMatchObject({ lane: 0, lanes: 1 });
	});

	it('reuses a lane once its occupant has ended', () => {
		// A 09:00–10:00 keynote alongside two half-hour talks: the short pair share
		// the second lane rather than opening a third.
		const laid = laneLayout([talk('Long', 540, 60), talk('First', 540), talk('Second', 570)]);

		expect(laid.map((l) => [l.session.title, l.lane, l.lanes])).toEqual([
			['Long', 0, 2],
			['First', 1, 2],
			['Second', 1, 2]
		]);
	});

	it('gives a session with no end time a lane of its own', () => {
		const laid = laneLayout([
			{ title: 'Open', startMinutes: 540, endMinutes: null },
			talk('A', 540)
		]);

		expect(laid).toHaveLength(2);
		expect(new Set(laid.map((l) => l.lane)).size).toBe(2);
	});

	it('has nothing to lay out for an empty room', () => {
		expect(laneLayout([])).toEqual([]);
	});
});

describe('dropTarget', () => {
	// Four rooms over 400px and 36 rows over 360px: every column is 100px and every
	// row 10px, so the expected answers are arithmetic rather than guesses.
	const rooms = [11, 22, 33, 44];
	const slots = gridSlots({ ...DAY, sessions: [] });
	const day = frame(rooms, slots);
	const box = { left: 100, top: 50, width: 400, height: 360 };

	it('reads the first slot of the first room out of the top-left corner', () => {
		expect(dropTarget(day, box, { x: 100, y: 50 })).toEqual({
			roomId: 11,
			startMinutes: 9 * 60
		});
	});

	it('reads the room from the column and the time from the row', () => {
		expect(dropTarget(day, box, { x: 250, y: 105 })).toEqual({
			roomId: 22,
			startMinutes: 10 * 60 + 15
		});
	});

	// The bottom-right pixel belongs to the last cell rather than to a cell that
	// does not exist — the one coordinate where a plain floor() reads one past the
	// end of both arrays.
	it('keeps the far corner inside the grid', () => {
		expect(dropTarget(day, box, { x: 500, y: 410 })).toEqual({
			roomId: 44,
			startMinutes: 17 * 60 + 45
		});
	});

	it('refuses a point outside the grid rather than snapping to the nearest slot', () => {
		expect(dropTarget(day, box, { x: 99, y: 100 })).toBeNull();
		expect(dropTarget(day, box, { x: 501, y: 100 })).toBeNull();
		expect(dropTarget(day, box, { x: 200, y: 49 })).toBeNull();
		expect(dropTarget(day, box, { x: 200, y: 411 })).toBeNull();
	});

	it('has no target on a day with no rooms, and none on a zero-width grid', () => {
		expect(dropTarget(frame([], slots), box, { x: 200, y: 100 })).toBeNull();
		expect(
			dropTarget(day, { left: 100, top: 50, width: 0, height: 360 }, { x: 100, y: 100 })
		).toBeNull();
	});
});
