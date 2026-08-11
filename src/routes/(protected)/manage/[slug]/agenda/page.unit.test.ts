/**
 * The agenda may be wide — it is a grid — but it must not be flush against the rail,
 * and twenty rooms must not mean twenty cards with no way to narrow them.
 */
import type { BoardSession, Conflict } from '$lib/server/conference/agenda';
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

type BoardOverrides = {
	placed?: BoardSession[];
	tray?: BoardSession[];
	conflicts?: Conflict[];
};

const renderWith = (roomCount: number, dayCount = 1, board: BoardOverrides = {}) =>
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
					placed: board.placed ?? [],
					tray: board.tray ?? [],
					conflicts: board.conflicts ?? []
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

/**
 * #154 — long titles and conflict badges must stay inside a narrow slot.
 *
 * SSR cannot measure pixels, so this pins the layout contract that makes the
 * clip possible: min-width: 0 on the card, wrapping on title and conflict, and
 * a title= attribute so the full conflict detail stays reachable when the
 * badge has to wrap or clip. Two overlapping placements force a lane split
 * (narrower than a full column), which is the case that was overflowing.
 */
describe('agenda card text overflow (#154)', () => {
	const longTitle =
		'From distributed tracing to real-time anomaly detection across multi-region Kubernetes clusters without drowning the on-call in noise';
	const conflictDetail = 'Two sessions in Room 1 at 09:00';

	const placedSession = (placementId: number, title: string): BoardSession => ({
		placementId,
		submissionId: placementId,
		title,
		kind: 'talk',
		status: 'tentative',
		trackName: 'Platform Engineering',
		formatName: 'Talk',
		minutes: 30,
		dayId: 1,
		roomId: 1,
		startMinutes: 540,
		endMinutes: 570,
		speakers: ['Dr. Alexandra van der Berg-Johansson']
	});

	it('keeps a long title and conflict badge inside a lane-split slot', () => {
		const body = renderWith(2, 1, {
			placed: [
				placedSession(1, longTitle),
				// Same room and time → laneLayout splits the column in half.
				placedSession(2, 'A second talk that forces the lane split')
			],
			conflicts: [
				{
					kind: 'room',
					placementIds: [1, 2],
					detail: conflictDetail
				}
			]
		});

		expect(body).toContain('data-testid="agenda-placed-session"');
		expect(body).toContain(longTitle);
		expect(body).toContain('data-testid="agenda-conflict"');
		expect(body).toContain(conflictDetail);

		// Card and button constrain width; title/conflict wrap rather than spill.
		expect(body).toMatch(/data-testid="agenda-placed-session"[^>]*min-w-0/);
		expect(body).toMatch(/data-testid="agenda-conflict"[^>]*break-words/);
		// Full conflict text stays on the element for hover / AT even if clipped.
		expect(body).toContain(`title="${conflictDetail}"`);
		expect(body).toContain(`title="${longTitle}"`);
	});
});
