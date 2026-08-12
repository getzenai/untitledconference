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
 * #154 / card polish — long titles stay inside a narrow slot, and the title is
 * the first line (not the clock — the grid axis already shows that).
 *
 * SSR cannot measure pixels, so this pins the layout contract: min-width: 0 and
 * truncate on the title, min-h-8 so a short slot still has room for that one line,
 * and lane-split still clips width. Full strings that CSS clips are carried by the
 * shadcn Tooltip (#219), not by a title= attribute.
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
		submissionStatus: 'accepted',
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

		// Card constrains width; title truncates rather than spills.
		expect(body).toMatch(/data-testid="agenda-placed-session"[^>]*min-w-0/);
		expect(body).toMatch(/data-testid="agenda-session-title"[^>]*truncate/);
		// Conflict detail still uses title= (not a primary label on a dense card).
		expect(body).toContain(`title="${conflictDetail}"`);
		// Session title is in the DOM (CSS may clip it); no title= crutch.
		expect(body).not.toMatch(/data-testid="agenda-session-title"[^>]*title=/);
	});

	it('puts the title first and floors short cards so it stays readable', () => {
		const title = 'Keynote: shipping on a fifteen-minute slot';
		// 15 minutes → one grid row (ROW_REM); without a floor the card collapses
		// past a readable title line.
		const short: BoardSession = {
			...placedSession(3, title),
			minutes: 15,
			startMinutes: 540,
			endMinutes: 555
		};
		const body = renderWith(1, 1, { placed: [short], tray: [] });

		expect(body).toMatch(/data-testid="agenda-placed-session"[^>]*min-h-8/);
		expect(body).toContain('data-testid="agenda-session-title"');
		expect(body).toContain(title);

		// Title is the primary line — ahead of the secondary clock range.
		const cardStart = body.indexOf('data-testid="agenda-placed-session"');
		const cardEnd = body.indexOf('</button>', cardStart);
		const card = body.slice(cardStart, cardEnd);
		const titleMark = card.indexOf('data-testid="agenda-session-title"');
		const clockMark = card.indexOf('09:00–09:15');
		expect(titleMark).toBeGreaterThan(-1);
		expect(clockMark).toBeGreaterThan(titleMark);
	});

	it('marks a declined talk that still has a slot (#9)', () => {
		const declined: BoardSession = {
			...placedSession(9, 'A talk that was declined after scheduling'),
			status: 'confirmed',
			submissionStatus: 'rejected'
		};
		const body = renderWith(1, 1, { placed: [declined], tray: [] });

		expect(body).toContain('data-testid="rejected-placement-badge"');
		expect(body).toContain('Declined');
	});
});

/**
 * #219 — Agenda-Builder for humans (World's Fair density).
 *
 * Room heads stack name over "+ slot" so similar prefixes stay distinguishable.
 * Publish state is a colour, not a "Published" badge that steals title width.
 * Full names that CSS truncates are reached via the shadcn Tooltip trigger (not title=).
 */
describe('agenda builder readability (#219)', () => {
	const placedSession = (
		placementId: number,
		title: string,
		status: BoardSession['status'] = 'tentative'
	): BoardSession => ({
		placementId,
		submissionId: placementId,
		title,
		kind: 'talk',
		status,
		submissionStatus: 'accepted',
		trackName: 'Systems',
		formatName: 'Talk',
		minutes: 30,
		dayId: 1,
		roomId: 1,
		startMinutes: 540,
		endMinutes: 570,
		speakers: ['Ada']
	});

	it('stacks + slot under the room name and keeps the full name in the head', () => {
		// Twenty rooms with the same prefix — the World's Fair case that used to
		// collapse every header to "M…", "R…", "W…" once the button ate the row.
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					board: {
						days: [{ id: 1, date: '2027-05-10', position: 0 }],
						rooms: Array.from({ length: 20 }, (_, i) => ({
							id: i + 1,
							name: `Main Hall Track ${String.fromCharCode(65 + (i % 26))} ${i + 1}`,
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

		expect(body).toContain('data-testid="agenda-room-head"');
		// Class list comes before data-testid in the SSR attribute order.
		expect(body).toMatch(/flex-col[^>]*data-testid="agenda-room-head"/);
		expect(body).toContain('data-testid="agenda-room-name"');
		expect(body).toContain('Main Hall Track A 1');
		expect(body).toContain('Main Hall Track T 20');
		// Open-slot control stays findable for Cypress and the keyboard path.
		expect(body).toContain('data-testid="agenda-open-slot-1"');
		// Room name is no longer forced to share a single row with the button.
		const headStart = body.indexOf('data-testid="agenda-room-head"');
		const headEnd = body.indexOf('data-column-body', headStart);
		const head = body.slice(headStart, headEnd);
		const nameMark = head.indexOf('data-testid="agenda-room-name"');
		const slotMark = head.indexOf('data-testid="agenda-open-slot-1"');
		expect(nameMark).toBeGreaterThan(-1);
		expect(slotMark).toBeGreaterThan(nameMark);
	});

	it('codes publish state with colour instead of a width-eating badge', () => {
		const body = renderWith(1, 1, {
			placed: [
				placedSession(1, 'A published keynote that needs every pixel of its title', 'confirmed'),
				{
					...placedSession(2, 'A draft still waiting for the publish pass', 'tentative'),
					roomId: 1,
					startMinutes: 570,
					endMinutes: 600
				}
			]
		});

		// No visible Published/Draft badge text on the card chrome.
		expect(body).not.toMatch(/data-slot="badge"[^>]*>\s*Published/);
		expect(body).not.toMatch(/data-slot="badge"[^>]*>\s*Draft/);
		expect(body).toContain('data-publish-state="published"');
		expect(body).toContain('data-publish-state="draft"');
		expect(body).toMatch(/data-publish-state="published"[^>]*border-status-good/);
		expect(body).toMatch(/data-publish-state="draft"[^>]*border-border/);
		// Title still present in full in the DOM (tooltip + truncate, no badge beside it).
		expect(body).toContain('A published keynote that needs every pixel of its title');
	});

	it('wires shadcn tooltip triggers on room names and session titles', () => {
		const body = renderWith(2, 1, {
			placed: [placedSession(1, 'Tooltip-worthy title that is longer than the column')]
		});

		// bits-ui marks the trigger; the full string is the tooltip content payload.
		expect(body).toContain('data-slot="tooltip-trigger"');
		expect(body).toContain('data-testid="agenda-room-name"');
		expect(body).toContain('data-testid="agenda-session-title"');
		// Full title is rendered (in trigger text and/or tooltip content) — not lost.
		expect(body).toContain('Tooltip-worthy title that is longer than the column');
		expect(body).toContain('Room 1');
	});
});
