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

const renderWith = (roomCount: number, dayCount = 1) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				board: {
					days: Array.from({ length: dayCount }, (_, i) => ({
						id: i + 1,
						date: `2027-05-${10 + i}`,
						position: i
					})),
					rooms: Array.from({ length: roomCount }, (_, i) => ({
						id: i + 1,
						name: `Room ${i + 1}`,
						position: i
					})),
					tracks: [],
					formats: [],
					// The room dropdown moved to `SlotEditor.svelte` and is covered by
					// `slot-editor.unit.test.ts`; what is left here is the layout and the
					// filter threshold, neither of which needs sessions on the board.
					placed: [],
					tray: [],
					conflicts: []
				},
				slots: [{ minutes: 540, label: '09:00' }]
			},
			form: null
		}
	}).body;

describe('organizer agenda layout', () => {
	it('pads the grid away from the rail while staying full width', () => {
		const body = renderWith(2);

		expect(body).toMatch(/<div class="[^"]*border-b[^"]*px-6 py-5[^"]*"/);
		expect(body).toMatch(/<div class="space-y-6 px-6 py-5"/);
	});

	it('does not bury room/track creation on the agenda (#63)', () => {
		const body = renderWith(2);
		expect(body).not.toContain('action="?/addRoom"');
		expect(body).not.toContain('action="?/addTrack"');
		expect(body).not.toContain('New room');
		expect(body).toContain('/manage/test-conf/settings');
	});

	// The pair either side of the threshold, not two points far away from it: a test
	// that only knows 2-versus-20 stays green if the threshold moves to 19.
	it('offers a room filter at six rooms and not at five', () => {
		expect(renderWith(5)).not.toContain('data-testid="agenda-room-filter"');

		const six = renderWith(6);
		expect(six).toContain('data-testid="agenda-room-filter"');
		expect(six).toContain('All 6 rooms');
	});
});

/**
 * The empty board is where a fresh organizer lands, and until #86 it sent them to
 * a settings page that could not create a day. Now it can, so the copy has to name
 * the thing that actually produces days: the conference date range.
 */
describe('empty board guidance', () => {
	it('points at the date range when the conference has no days', () => {
		const body = renderWith(2, 0);

		expect(body).toContain('Days follow from the conference dates');
		expect(body).toContain('/manage/test-conf/settings');
	});

	it('says nothing about days when only a room is missing', () => {
		const body = renderWith(0);

		expect(body).toContain('Add rooms in');
		expect(body).not.toContain('Days follow from the conference dates');
	});
});
