/**
 * The slot editor's room dropdown must offer every room it is handed.
 *
 * This is half of a contract that used to live in one page test. The half here:
 * given a list of rooms, the editor renders all of them and drops none. The
 * other half — that the *page* hands it the unfiltered list rather than the
 * room-filtered one — cannot be seen from props and is pinned in
 * `cypress/e2e/critical-paths/agenda-slot-editor.cy.ts` with the filter set.
 *
 * Splitting it this way is deliberate. `<SlotEditor rooms={visibleRooms} />`
 * would keep every assertion in this file green, so a file that claimed both
 * halves would be claiming one it cannot check.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SlotEditor from './SlotEditor.svelte';

const rooms = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Room ${i + 1}` }));

const waiting = (placementId: number) => ({
	placementId,
	title: `Talk ${placementId}`,
	minutes: 30,
	startMinutes: null,
	endMinutes: null,
	speakers: ['Robin']
});

const placed = (placementId: number) => ({
	placementId,
	title: `Talk ${placementId}`,
	minutes: 30,
	startMinutes: 540,
	endMinutes: 570,
	speakers: ['Robin']
});

const timeLabel = (minutes: number | null) =>
	minutes === null
		? ''
		: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function body(props: {
	rooms: { id: number; name: string }[];
	occupant?: ReturnType<typeof placed> | null;
	tray?: ReturnType<typeof waiting>[];
}) {
	return render(SlotEditor, {
		props: {
			target: { roomId: 1, roomName: 'Room 1', startMinutes: 540 },
			occupant: props.occupant ?? null,
			tray: props.tray ?? [waiting(1)],
			days: [{ id: 1, date: '2027-05-10' }],
			rooms: props.rooms,
			slots: [{ minutes: 540, label: '09:00' }],
			activeDayId: 1,
			busy: false,
			timeLabel,
			close: () => {},
			// `use:enhance` never runs under a server render, so the callback is
			// only here to satisfy the prop.
			submit: () => async () => {}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	}).body;
}

/** Every `<option>` label inside the rendered `name="roomId"` select. */
const roomOptions = (html: string) => {
	const select = /<select[^>]*name="roomId"[^>]*>([\s\S]*?)<\/select>/.exec(html);
	// Without the select there is nothing to compare, and an empty list would
	// compare equal to an empty expectation. Fail here instead.
	if (!select) throw new Error('the editor rendered no roomId select');

	return [...select[1].matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)].map((o) => o[1].trim());
};

describe('the slot editor', () => {
	it('offers every room it is given', () => {
		const html = body({ rooms });

		expect(roomOptions(html)).toEqual(['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6']);
	});

	it('preselects the room the slot belongs to', () => {
		// Opening the slot in Room 1 and submitting without touching the dropdown
		// has to put the session where the organizer clicked.
		const html = body({ rooms });

		expect(html).toMatch(/<option[^>]*value="1"[^>]*selected[^>]*>\s*Room 1/);
	});

	it('offers no way to place onto a taken slot', () => {
		// The double-book path. `placeSession` is permissive about conflicts, so a
		// place form here would silently overlap rather than swap or refuse.
		const html = body({ rooms, occupant: placed(7), tray: [waiting(1)] });

		expect(html).toContain('data-testid="agenda-slot-remove"');
		expect(html).not.toContain('data-testid="agenda-slot-place"');
		expect(html).not.toContain('name="roomId"');
	});

	it('says so when nothing is waiting, rather than showing an empty dropdown', () => {
		const html = body({ rooms, tray: [] });

		expect(html).toContain('Nothing is waiting for a slot');
		expect(html).not.toContain('data-testid="agenda-slot-place"');
	});
});
