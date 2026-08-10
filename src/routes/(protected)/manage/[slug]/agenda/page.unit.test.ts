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

const renderWith = (roomCount: number) =>
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

	it('offers a room filter once a conference has enough rooms to lose one in', () => {
		expect(renderWith(2)).not.toContain('data-testid="agenda-room-filter"');

		const many = renderWith(20);
		expect(many).toContain('data-testid="agenda-room-filter"');
		// Hiding a room from the grid must not make it unreachable: the move
		// dropdowns still carry every room.
		expect(many).toContain('All 20 rooms');
	});
});
