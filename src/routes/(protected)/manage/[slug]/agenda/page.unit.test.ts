/**
 * The agenda may be wide — it is a grid — but it must not be flush against the rail,
 * and twenty rooms must not mean twenty cards with no way to narrow them.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const session = (placementId: number, roomId: number | null) => ({
	placementId,
	submissionId: placementId,
	title: `Talk ${placementId}`,
	kind: 'talk',
	status: 'tentative',
	trackName: null,
	formatName: null,
	minutes: 30,
	dayId: roomId === null ? null : 1,
	roomId,
	startMinutes: roomId === null ? null : 540,
	endMinutes: roomId === null ? null : 570,
	speakers: ['Robin']
});

const renderWith = (roomCount: number, movable = false) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				board: {
					days: [{ id: 1, date: '2027-05-10', position: 0 }],
					rooms: Array.from({ length: roomCount }, (_, i) => ({
						id: i + 1,
						name: `Room ${i + 1}`,
						position: i
					})),
					tracks: [],
					formats: [],
					// One waiting talk and one already on the grid: the two places a room
					// dropdown exists at all. Without them the page renders no `roomId`
					// select and a test about dropdowns has nothing to look at.
					placed: movable ? [session(2, 1)] : [],
					tray: movable ? [session(1, null)] : [],
					conflicts: []
				},
				slots: [{ minutes: 540, label: '09:00' }]
			},
			form: null
		}
	}).body;

/** Every `<option>` label inside each rendered `name="roomId"` select. */
const roomSelects = (body: string) =>
	[...body.matchAll(/<select[^>]*name="roomId"[^>]*>([\s\S]*?)<\/select>/g)].map((select) =>
		[...select[1].matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)].map((o) => o[1].trim())
	);

describe('organizer agenda layout', () => {
	it('pads the grid away from the rail while staying full width', () => {
		const body = renderWith(2);

		expect(body).toMatch(/<div class="[^"]*border-b[^"]*px-6 py-5[^"]*"/);
		expect(body).toMatch(/<div class="space-y-6 px-6 py-5"/);
	});

	// The pair either side of the threshold, not two points far away from it: a test
	// that only knows 2-versus-20 stays green if the threshold moves to 19.
	it('offers a room filter at six rooms and not at five', () => {
		expect(renderWith(5)).not.toContain('data-testid="agenda-room-filter"');

		const six = renderWith(6);
		expect(six).toContain('data-testid="agenda-room-filter"');
		expect(six).toContain('All 6 rooms');
	});

	/**
	 * Hiding a room from the grid must not make it unreachable. What this pins is the
	 * rendered markup: with the filter offered, both room dropdowns — the one on a
	 * waiting talk and the one on a placed session — list every room, not a subset.
	 * It does not exercise the client-side filter: the select starts on "all", so a
	 * server render cannot tell `board.rooms` from `visibleRooms`. That the dropdowns
	 * read the unfiltered list is a code fact, checked by reading, not by this test.
	 */
	it('offers every room in both move dropdowns while the filter is on screen', () => {
		const selects = roomSelects(renderWith(6, true));
		const allRooms = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5', 'Room 6'];

		expect(selects).toHaveLength(2);
		for (const options of selects) expect(options).toEqual(allRooms);
	});
});
