/**
 * The drag gesture's decisions, without a browser.
 *
 * The Cypress spec proves a real pointer reaches this code and that a drop
 * survives the round trip to the database. What it cannot do cheaply is the
 * inventory of things a drop must *not* do — the press that never moved, the drop
 * back where it started, the drop onto a taken slot. Each of those is a write that
 * would look plausible in a screenshot and be wrong in the table.
 */
import { gridSlots } from '$lib/conference/agenda-grid';
import { describe, expect, it, vi } from 'vitest';
import { DragController, type SlotRef } from './drag-controller.svelte';

const ROOMS = [11, 22];
const SLOTS = gridSlots({ dayStartsAt: 9 * 60, dayEndsAt: 18 * 60, slotMinutes: 15, sessions: [] });

/** Two rooms of 100px over 36 rows of 10px, so every expected slot is arithmetic. */
const BOX = { left: 0, top: 0, width: 200, height: 360 };

const element = { closest: () => null } as unknown as HTMLElement;

const pointerAt = (
	x: number,
	y: number,
	options: { target?: HTMLElement; altKey?: boolean } = {}
) =>
	({
		clientX: x,
		clientY: y,
		pointerType: 'mouse',
		button: 0,
		altKey: options.altKey ?? false,
		target: options.target ?? element,
		currentTarget: element
	}) as unknown as PointerEvent;

function harness(occupied: { slot: SlotRef; placementId: number; status?: string }[] = []) {
	const place = vi.fn();
	const openSlot = vi.fn();

	const controller = new DragController({
		frame: () => ({ rooms: ROOMS, slots: SLOTS, slotMinutes: 15 }),
		columnsBox: () => BOX,
		occupantAt: (slot) =>
			occupied.find(
				(o) => o.slot.roomId === slot.roomId && o.slot.startMinutes === slot.startMinutes
			) ?? null,
		place,
		openSlot
	});

	return { controller, place, openSlot };
}

const TRAY_ITEM = { placementId: 1, title: 'Talk', roomId: null };

describe('DragController', () => {
	it('places a dragged session on the slot under the pointer', () => {
		const { controller, place } = harness();

		controller.begin(pointerAt(0, 0), TRAY_ITEM);
		controller.move(pointerAt(150, 105));
		controller.end();

		// Second room, eleventh row: 11:30.
		expect(place).toHaveBeenCalledWith(1, { roomId: 22, startMinutes: 11 * 60 + 30 }, 'move');
	});

	// The gesture that ends where it began is a click on a slot, and a click has to
	// stay a click: the block is also the button that opens its own editor.
	it('writes nothing when the pointer never crossed the threshold', () => {
		const { controller, place, openSlot } = harness();

		controller.begin(pointerAt(50, 50), TRAY_ITEM);
		controller.move(pointerAt(52, 52));
		controller.end();

		expect(place).not.toHaveBeenCalled();
		expect(openSlot).not.toHaveBeenCalled();
		expect(controller.moved).toBe(false);
	});

	it('writes nothing when the drop lands off the grid', () => {
		const { controller, place, openSlot } = harness();

		controller.begin(pointerAt(50, 50), TRAY_ITEM);
		controller.move(pointerAt(400, 50));
		controller.end();

		expect(place).not.toHaveBeenCalled();
		expect(openSlot).not.toHaveBeenCalled();
	});

	/**
	 * A published occupant is still a question. Two drafts in one slot are
	 * alternatives (#559), so that drop writes.
	 */
	it('opens the editor instead of placing onto a published slot', () => {
		const { controller, place, openSlot } = harness([
			{ slot: { roomId: 22, startMinutes: 11 * 60 + 30 }, placementId: 7, status: 'confirmed' }
		]);

		controller.begin(pointerAt(0, 0), TRAY_ITEM);
		controller.move(pointerAt(150, 105));
		controller.end();

		expect(place).not.toHaveBeenCalled();
		expect(openSlot).toHaveBeenCalledWith({ roomId: 22, startMinutes: 11 * 60 + 30 });
	});

	it('places onto a draft occupant so both talks stay as alternatives', () => {
		const { controller, place, openSlot } = harness([
			{ slot: { roomId: 22, startMinutes: 11 * 60 + 30 }, placementId: 7, status: 'tentative' }
		]);

		controller.begin(pointerAt(0, 0), TRAY_ITEM);
		controller.move(pointerAt(150, 105));
		controller.end();

		expect(openSlot).not.toHaveBeenCalled();
		expect(place).toHaveBeenCalledWith(1, { roomId: 22, startMinutes: 11 * 60 + 30 }, 'move');
	});

	// Dropping a session back on itself is the same slot it already occupies, so it
	// is neither a move nor a double-book — posting it would still reload the board
	// and read as if something had happened.
	it('does nothing when a session is dropped back where it started', () => {
		const here = { roomId: 22, startMinutes: 11 * 60 + 30 };
		const { controller, place, openSlot } = harness([{ slot: here, placementId: 5 }]);

		controller.begin(pointerAt(0, 0), { placementId: 5, title: 'Talk', roomId: 22 });
		controller.move(pointerAt(150, 105));
		controller.end();

		expect(place).not.toHaveBeenCalled();
		expect(openSlot).not.toHaveBeenCalled();
	});

	/**
	 * #596. The old rule decided by itself — a draft already on the grid grew a
	 * twin — and the organizer could not tell in advance which of the two a drag
	 * would do. Now the plain gesture is always a move and the copy is asked for.
	 */
	describe('move unless Alt is held', () => {
		const PLACED = { placementId: 5, title: 'Talk', roomId: 11 };

		it('moves a draft that is already on the grid', () => {
			const { controller, place } = harness([
				{ slot: { roomId: 11, startMinutes: 9 * 60 }, placementId: 5, status: 'tentative' }
			]);

			controller.begin(pointerAt(0, 0), PLACED);
			controller.move(pointerAt(150, 105));
			controller.end(pointerAt(150, 105));

			expect(place).toHaveBeenCalledWith(5, { roomId: 22, startMinutes: 11 * 60 + 30 }, 'move');
		});

		it('copies it when Alt is down at the release', () => {
			const { controller, place } = harness();

			controller.begin(pointerAt(0, 0), PLACED);
			controller.move(pointerAt(150, 105, { altKey: true }));
			expect(controller.intent).toBe('alternative');
			controller.end(pointerAt(150, 105, { altKey: true }));

			expect(place).toHaveBeenCalledWith(
				5,
				{ roomId: 22, startMinutes: 11 * 60 + 30 },
				'alternative'
			);
		});

		// The key can be pressed or let go halfway through, and what counts is
		// what the hand was doing when the card landed.
		it('takes the modifier from the release, not from the press', () => {
			const { controller, place } = harness();

			controller.begin(pointerAt(0, 0, { altKey: true }), PLACED);
			controller.move(pointerAt(150, 105, { altKey: true }));
			controller.end(pointerAt(150, 105));

			expect(place).toHaveBeenCalledWith(5, { roomId: 22, startMinutes: 11 * 60 + 30 }, 'move');
		});

		// A held key on a still pointer fires no pointer event at all.
		it('follows the keyboard while the pointer sits still', () => {
			const { controller } = harness();

			controller.begin(pointerAt(0, 0), PLACED);
			controller.move(pointerAt(150, 105));
			controller.modifier(true);
			expect(controller.intent).toBe('alternative');
			controller.modifier(false);
			expect(controller.intent).toBe('move');
		});

		// Nothing to leave behind, so the copy would be a lie — and the badge that
		// promises it must not appear either.
		it('stays a move for a tray card even with Alt held', () => {
			const { controller, place } = harness();

			controller.begin(pointerAt(0, 0, { altKey: true }), TRAY_ITEM);
			controller.move(pointerAt(150, 105, { altKey: true }));
			expect(controller.intent).toBe('move');
			controller.end(pointerAt(150, 105, { altKey: true }));

			expect(place).toHaveBeenCalledWith(1, { roomId: 22, startMinutes: 11 * 60 + 30 }, 'move');
		});

		it('forgets the modifier when the drag is cancelled', () => {
			const { controller } = harness();

			controller.begin(pointerAt(0, 0), PLACED);
			controller.move(pointerAt(150, 105, { altKey: true }));
			controller.cancel();

			expect(controller.intent).toBe('move');
		});
	});

	it('leaves a nested button its own gesture rather than dragging the block', () => {
		const { controller, place } = harness();
		const button = { closest: () => ({}) } as unknown as HTMLElement;

		controller.begin(pointerAt(0, 0, { target: button }), TRAY_ITEM);
		controller.move(pointerAt(150, 105));
		controller.end();

		expect(controller.dragging).toBeNull();
		expect(place).not.toHaveBeenCalled();
	});

	it('highlights the slot under the pointer while dragging, and forgets it on cancel', () => {
		const { controller } = harness();

		controller.begin(pointerAt(0, 0), TRAY_ITEM);
		controller.move(pointerAt(150, 105));
		expect(controller.hover).toEqual({ roomId: 22, startMinutes: 11 * 60 + 30 });

		controller.cancel();
		expect(controller.hover).toBeNull();
		expect(controller.dragging).toBeNull();
	});
});
