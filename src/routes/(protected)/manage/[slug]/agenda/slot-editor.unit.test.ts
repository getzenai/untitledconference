/**
 * What a server render can still prove about the slot editor (#167).
 *
 * The five dropdowns are app selects now, and a closed app select renders a
 * trigger and a hidden input — its options do not exist until the listbox
 * opens. "Offers every room it is handed" is therefore no longer a claim this
 * file can make; it moved to `agenda-slot-editor.cy.ts`, where the listbox is
 * real, together with the half that was always there (that the *page* hands
 * over the unfiltered room list rather than the filtered one).
 *
 * What SSR gained in the same swap is worth more than what it lost. A native
 * `<select>` with no `selected` option silently posts its first one; an app
 * select posts nothing unless `value` names a real option. The hidden input is
 * that value, in the markup, before anybody clicks — so every assertion below
 * is the guard against a dropdown that looks right and submits empty.
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

/**
 * What an app select puts on the wire: the hidden input it renders for `name`.
 *
 * Deliberately not the trigger's label. The label is what the organizer reads;
 * this is what the action receives, and the two only agree when the seeding is
 * right — which is the thing being tested.
 */
const posted = (html: string, name: string) => {
	const input = new RegExp(`<input[^>]*value="([^"]*)"[^>]*name="${name}"`).exec(html);
	// An absent input and an empty one both mean "posts nothing", but only one of
	// them is a wiring mistake. Separate them here rather than in every caller.
	if (!input) throw new Error(`the editor rendered no hidden input for ${name}`);

	return input[1];
};

describe('the slot editor', () => {
	it('carries the slot the organizer clicked, without anyone touching a dropdown', () => {
		// Opening the slot in Room 1 at 09:00 and submitting untouched has to put
		// the session where the organizer clicked. The native element did this by
		// falling back to its first option; an app select only does it because
		// `value` says so.
		const html = body({ rooms });

		expect(posted(html, 'roomId')).toBe('1');
		expect(posted(html, 'startMinutes')).toBe('540');
		expect(posted(html, 'dayId')).toBe('1');
		// The tray's first talk, which is what the browser used to pick for us.
		expect(posted(html, 'placementId')).toBe('1');
	});

	it('falls back to the first day when no day tab is active', () => {
		// `activeDayId` is optional. A native `<select>` shrugged and took its
		// first option; an app select would show a placeholder and post nothing,
		// so `?/place` would fail on a form that looked filled in.
		const html = render(SlotEditor, {
			props: {
				target: { roomId: 1, roomName: 'Room 1', startMinutes: 540 },
				occupant: null,
				swapWith: [],
				tray: [waiting(1)],
				days: [{ id: 4, date: '2027-05-10' }],
				rooms,
				slots: [{ minutes: 540, label: '09:00' }],
				activeDayId: undefined,
				busy: false,
				timeLabel,
				close: () => {},
				submit: () => async () => {}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any
		}).body;

		expect(posted(html, 'dayId')).toBe('4');
	});

	it('names the room it will place into, so the trigger and the wire agree', () => {
		const html = body({ rooms });

		expect(html).toContain('data-testid="agenda-slot-room"');
		expect(html).toContain('Room 1');
	});

	it('offers no way to place onto a taken slot', () => {
		// The double-book path. `placeSession` is permissive about conflicts, so a
		// place form here would silently overlap rather than swap or refuse.
		const html = body({ rooms, occupant: placed(7), tray: [waiting(1)] });

		expect(html).toContain('data-testid="agenda-slot-remove"');
		expect(html).not.toContain('data-testid="agenda-slot-place"');
		expect(html).not.toContain('name="roomId"');
	});

	it('posts to ?/swap with both ids, the partner seeded the way the browser used to', () => {
		const html = body({
			rooms,
			occupant: placed(7),
			swapWith: [candidate(8, 600, 'Room 2'), candidate(9, 660, 'Room 3')]
		});

		expect(html).toContain('action="?/swap"');
		// The occupant travels as `placementId`; the action needs both halves.
		expect(html).toMatch(/name="placementId"[^>]*value="7"/);
		expect(posted(html, 'withPlacementId')).toBe('8');

		// The label has to say where the partner is, or two 30-minute talks are
		// indistinguishable. On a closed app select only the picked one is
		// readable; the full list is counted in the Cypress spec.
		expect(html.replace(/<!--[^>]*-->/g, '')).toContain('Talk 8 (10:00, Room 2)');
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

	/**
	 * A room-bound sponsor hold opens this dialog like any other card, and every
	 * button in the taken-slot shape is wrong for it (#450). Swap and "take it out"
	 * read a length off a format a hold does not have, and "take it out" parks it
	 * where only talks are shown — the slot leaves the screen while the decision
	 * count still counts it. Release is the one move that means anything.
	 */
	it('offers a hold release instead of swap, remove and publish', () => {
		const hold = { ...placed(7, 'confirmed'), kind: 'reservation', speakers: [], title: 'Gold' };
		const html = body({ rooms, occupant: hold, swapWith: [candidate(8, 600, 'Room 2')] });

		expect(html).toContain('action="?/release"');
		expect(html).toContain('data-testid="agenda-slot-release"');
		expect(html).toMatch(/name="placementId"[^>]*value="7"/);
		expect(html).toContain('Release this hold');
		expect(html).toContain('Sponsor hold');

		expect(html).not.toContain('action="?/swap"');
		expect(html).not.toContain('data-testid="agenda-slot-remove"');
		expect(html).not.toContain('data-testid="agenda-slot-status"');
		// "No speaker" under a sponsor slot reads as a talk missing its speaker.
		expect(html).not.toContain('No speaker');
	});

	it('calls a break a break, and a talk without a kind a talk', () => {
		const brk = { ...placed(7), kind: 'block', speakers: [], title: 'Lunch' };
		expect(body({ rooms, occupant: brk })).toContain('Remove this break');

		// Every existing caller passes a talk with no `kind` at all; it has to keep
		// its swap and remove buttons rather than fall into the hold shape.
		const talk = body({ rooms, occupant: placed(7), swapWith: [candidate(8, 600, 'Room 2')] });
		expect(talk).toContain('action="?/swap"');
		expect(talk).toContain('data-testid="agenda-slot-remove"');
		expect(talk).not.toContain('action="?/release"');
	});

	it('says so when nothing is waiting, rather than showing an empty dropdown', () => {
		const html = body({ rooms, tray: [] });

		expect(html).toContain('Nothing is waiting for a slot');
		expect(html).not.toContain('data-testid="agenda-slot-place"');
	});
});
