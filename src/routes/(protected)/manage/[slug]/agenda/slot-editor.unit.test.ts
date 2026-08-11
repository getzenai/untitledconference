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
	speakers: ['Robin'],
	status: 'tentative'
});

const placed = (placementId: number, status = 'tentative') => ({
	placementId,
	title: `Talk ${placementId}`,
	minutes: 30,
	startMinutes: 540,
	endMinutes: 570,
	speakers: ['Robin'],
	status
});

const timeLabel = (minutes: number | null) =>
	minutes === null
		? ''
		: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const candidate = (placementId: number, startMinutes: number, roomName: string) => ({
	placementId,
	title: `Talk ${placementId}`,
	startMinutes,
	roomName
});

function body(props: {
	rooms: { id: number; name: string }[];
	occupant?: ReturnType<typeof placed> | null;
	swapWith?: ReturnType<typeof candidate>[];
	tray?: ReturnType<typeof waiting>[];
}) {
	return render(SlotEditor, {
		props: {
			target: { roomId: 1, roomName: 'Room 1', startMinutes: 540 },
			occupant: props.occupant ?? null,
			swapWith: props.swapWith ?? [],
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

	it('offers every swap partner it is given, and posts to ?/swap with both ids', () => {
		const html = body({
			rooms,
			occupant: placed(7),
			swapWith: [candidate(8, 600, 'Room 2'), candidate(9, 660, 'Room 3')]
		});

		const select = /<select[^>]*name="withPlacementId"[^>]*>([\s\S]*?)<\/select>/.exec(html);
		if (!select) throw new Error('the editor rendered no withPlacementId select');
		const options = [...select[1].matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)];

		expect(options.map((o) => o[1])).toEqual(['8', '9']);
		// The label has to say where the partner is, or the two 30-minute talks in
		// the list are indistinguishable.
		expect(options[0][2].replace(/\s+/g, ' ').trim()).toBe('Talk 8 (10:00, Room 2)');

		expect(html).toContain('action="?/swap"');
		// The occupant travels as `placementId`; the action needs both halves.
		expect(html).toMatch(/name="placementId"[^>]*value="7"/);
	});

	it('hides the swap form when the day holds nothing else', () => {
		// An empty dropdown that posts a swap with nobody is worse than no dropdown.
		const html = body({ rooms, occupant: placed(7), swapWith: [] });

		expect(html).not.toContain('data-testid="agenda-slot-swap"');
		expect(html).not.toContain('action="?/swap"');
		expect(html).toContain('data-testid="agenda-slot-remove"');
	});

	/**
	 * Publishing one session moved here from the grid, where the block that carried
	 * it is now only as tall as the talk is long. The button has to name the move it
	 * makes rather than the state it is in — and post the opposite of the current
	 * status, which is the half a label alone cannot prove.
	 */
	it('offers to publish a draft and to hold back a published one', () => {
		const draft = body({ rooms, occupant: placed(7, 'tentative') });
		expect(draft).toContain('data-testid="agenda-slot-status"');
		expect(draft).toContain('Publish it');
		expect(draft).toMatch(/name="status"[^>]*value="confirmed"/);

		const live = body({ rooms, occupant: placed(7, 'confirmed') });
		expect(live).toContain('Hold it back');
		expect(live).toMatch(/name="status"[^>]*value="tentative"/);
	});

	it('says so when nothing is waiting, rather than showing an empty dropdown', () => {
		const html = body({ rooms, tray: [] });

		expect(html).toContain('Nothing is waiting for a slot');
		expect(html).not.toContain('data-testid="agenda-slot-place"');
	});
});
