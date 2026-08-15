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

const pointerAt = (x: number, y: number, target: HTMLElement = element) =>
	({
		clientX: x,
		clientY: y,
		pointerType: 'mouse',
		button: 0,
		target,
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
		expect(place).toHaveBeenCalledWith(1, { roomId: 22, startMinutes: 11 * 60 + 30 });
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
		expect(place).toHaveBeenCalledWith(1, { roomId: 22, startMinutes: 11 * 60 + 30 });
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

	it('leaves a nested button its own gesture rather than dragging the block', () => {
		const { controller, place } = harness();
		const button = { closest: () => ({}) } as unknown as HTMLElement;

		controller.begin(pointerAt(0, 0, button), TRAY_ITEM);
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
