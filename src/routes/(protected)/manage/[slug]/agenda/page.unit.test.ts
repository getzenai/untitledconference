/**
 * The agenda may be wide — it is a grid — but it must not be flush against the rail,
 * and twenty rooms must not mean twenty cards with no way to narrow them.
 */
import type { BoardSession, Conflict } from '$lib/server/conference/agenda';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
	statusBeforeArchive: null,
	listedPublicly: false,
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
				speakerProfile: false,
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

	/**
	 * #64 scaling: many rooms force horizontal scroll. The time gutter must stick
	 * so the hour labels stay readable while the organizer pans across columns.
	 */
	it('keeps the time gutter sticky inside a horizontal scroll region', () => {
		const body = renderWith(12);
		expect(body).toContain('data-testid="agenda-grid-scroll"');
		expect(body).toContain('data-testid="agenda-time-gutter"');
		// Class list is emitted before data-testid in SSR attribute order.
		expect(body).toMatch(/sticky left-0[^>]*data-testid="agenda-time-gutter"/);
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
					speakerProfile: false,
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

	/**
	 * Review on #222: `{...props}` then bare `onclick`/`onpointerdown` dropped
	 * bits-ui's handlers. Source contract — SSR does not exercise the merge.
	 */
	it('forwards TooltipTrigger pointer handlers before drag/click, and keeps room names out of the tab order', () => {
		const source = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '+page.svelte'),
			'utf8'
		);

		// Narrowed as `tip` so svelte-check accepts the bits-ui child props.
		expect(source).toContain('tip.onclick?.(e)');
		expect(source).toContain('tip.onpointerdown?.(e)');
		// Room heads only — session cards stay keyboard-reachable.
		expect(source).toMatch(/TooltipTrigger\s+tabindex=\{-1\}/);
	});
});

/**
 * #231 — the Decision-workflow pattern applied to auto-place. The button writes
 * immediately, only from the tray, and leaves placed talks where they are. That
 * has to be said *before* the click; the "Placed N…" line arrives too late.
 */
describe('auto-place hint (#231)', () => {
	const trayTalk = (placementId: number): BoardSession => ({
		placementId,
		submissionId: placementId,
		title: `Waiting talk ${placementId}`,
		kind: 'talk',
		status: 'tentative',
		submissionStatus: 'accepted',
		trackName: null,
		formatName: 'Talk',
		minutes: 30,
		dayId: null,
		roomId: null,
		startMinutes: null,
		endMinutes: null,
		speakers: ['Ada']
	});

	it('says what the button does before anyone clicks it', () => {
		const body = renderWith(1, 1, { tray: [trayTalk(1), trayTalk(2), trayTalk(3)] });

		expect(body).toContain('data-testid="agenda-autoplace-hint"');
		expect(body).toContain('Places the 3 waiting talks into free slots.');
		expect(body).toContain('Nothing already on the grid moves.');
		// The after-the-fact line is not a substitute — it is absent until submit.
		expect(body).not.toContain('Move anything you disagree with.');
	});

	it('uses the singular when one talk is waiting', () => {
		const body = renderWith(1, 1, { tray: [trayTalk(1)] });

		expect(body).toContain('Places the waiting talk into free slots.');
	});

	it('stays quiet when the button has nothing to do', () => {
		const body = renderWith(1, 1, { tray: [] });

		expect(body).not.toContain('data-testid="agenda-autoplace-hint"');
		expect(body).not.toContain('Nothing already on the grid moves.');
	});
});

/**
 * #497 — the organizer's publish state has to match what `/c/.../agenda` serves.
 *
 * A mixed board (some confirmed, some tentative) used to look like a draft:
 * the only sentence was "Publish the agenda", while the public page already
 * showed the confirmed talks. Unpublish was the same filled button as Publish,
 * so once the programme was live the loudest control took it down. And a
 * declined talk kept the published green.
 */
describe('agenda public state (#497)', () => {
	const talk = (
		id: number,
		status: BoardSession['status'],
		over: Partial<BoardSession> = {}
	): BoardSession => ({
		placementId: id,
		submissionId: id,
		title: `Talk ${id}`,
		kind: 'session',
		status,
		submissionStatus: 'accepted',
		trackName: null,
		formatName: 'Talk',
		minutes: 30,
		dayId: 1,
		roomId: 1,
		startMinutes: 540 + (id - 1) * 30,
		endMinutes: 570 + (id - 1) * 30,
		speakers: ['Ada'],
		...over
	});

	const breakSlot = (): BoardSession => ({
		placementId: 90,
		submissionId: null,
		title: 'Lunch',
		kind: 'block',
		status: 'confirmed',
		submissionStatus: null,
		trackName: null,
		formatName: null,
		minutes: 60,
		dayId: 1,
		roomId: null,
		startMinutes: 720,
		endMinutes: 780,
		speakers: []
	});

	it('says how many sessions the public can already see, including a mixed board', () => {
		const mixed = renderWith(1, 1, { placed: [talk(1, 'confirmed'), talk(2, 'tentative')] });
		expect(mixed).toContain('data-testid="agenda-public-state"');
		expect(mixed).toContain('The public agenda shows 1 of 2 sessions.');
		expect(mixed).toContain('Publish the agenda');
		expect(mixed).not.toContain('Unpublish the agenda');

		const live = renderWith(1, 1, { placed: [talk(1, 'confirmed'), talk(2, 'confirmed')] });
		expect(live).toContain('The public agenda shows 2 sessions.');
		expect(live).toContain('Unpublish the agenda');

		const draft = renderWith(1, 1, { placed: [talk(1, 'tentative')] });
		expect(draft).toContain('The public cannot see these slots yet.');
		expect(draft).toContain('Publish the agenda');
	});

	it('does not let a confirmed break pretend the talks are live', () => {
		const body = renderWith(1, 1, { placed: [talk(1, 'tentative'), breakSlot()] });

		expect(body).toContain('The public cannot see these slots yet.');
		expect(body).toContain('Publish the agenda');
		expect(body).not.toContain('Unpublish the agenda');
	});

	it('does not count a declined talk that kept its confirmed slot as live', () => {
		// The public loader also requires status=accepted. A withdrawn acceptance
		// leaves the confirmed placement standing, visibly wrong, for a human to
		// resolve — and the public page then shows nothing for that slot.
		const declined = talk(1, 'confirmed', { submissionStatus: 'rejected' });

		const alone = renderWith(1, 1, { placed: [declined] });
		expect(alone).toContain('The public cannot see these slots yet.');
		expect(alone).not.toContain('The public agenda shows 1 session.');

		const beside = renderWith(1, 1, { placed: [talk(2, 'confirmed'), declined] });
		expect(beside).toContain('The public agenda shows 1 of 2 sessions.');
	});

	/**
	 * The button is not the sentence.
	 *
	 * `?/publish` toggles placement status and knows nothing about acceptance, so
	 * reading the label off the live count took Unpublish away for as long as a
	 * declined talk sat in a confirmed slot — with the public still being served
	 * the rest. The label follows what the action owns; the sentence keeps saying
	 * what the public sees, including the "1 of 2" no two-state button can carry.
	 */
	it('still offers Unpublish while a declined talk holds a confirmed slot', () => {
		const declined = talk(1, 'confirmed', { submissionStatus: 'rejected' });

		const alone = renderWith(1, 1, { placed: [declined] });
		expect(alone).toContain('Unpublish the agenda');
		expect(alone).toContain('The public cannot see these slots yet.');

		const beside = renderWith(1, 1, { placed: [talk(2, 'confirmed'), declined] });
		expect(beside).toContain('Unpublish the agenda');
		expect(beside).toContain('The public agenda shows 1 of 2 sessions.');

		// A tentative talk beside it still has publishing left to do.
		const half = renderWith(1, 1, { placed: [talk(2, 'tentative'), declined] });
		expect(half).toContain('Publish the agenda');
		expect(half).not.toContain('Unpublish the agenda');
	});

	it('fills Publish and outlines Unpublish', () => {
		const publishButton = (html: string) => {
			const mark = html.indexOf('data-testid="agenda-publish"');
			expect(mark).toBeGreaterThan(-1);
			return html.slice(html.lastIndexOf('<button', mark), mark);
		};

		const draft = publishButton(renderWith(1, 1, { placed: [talk(1, 'tentative')] }));
		expect(draft).toContain('bg-primary');
		expect(draft).not.toContain('bg-background');

		const live = publishButton(renderWith(1, 1, { placed: [talk(1, 'confirmed')] }));
		expect(live).toContain('bg-background');
		expect(live).not.toContain('bg-primary');
	});

	it('names what went live, the way auto-place already names what it placed', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					board: {
						days: [{ id: 1, date: '2027-05-10', position: 0 }],
						rooms: [{ id: 1, name: 'Room 1', position: 0 }],
						tracks: [],
						formats: [],
						placed: [talk(1, 'confirmed')],
						tray: [],
						conflicts: []
					},
					slots: [{ minutes: 540, label: '09:00' }]
				},
				form: { published: true, changed: 1 }
			} as never
		}).body;

		expect(body).toContain('data-testid="agenda-publish-result"');
		expect(body).toContain('The public agenda now shows 1 session.');
	});

	it('does not dress a declined talk in the published green, and does not stack the clock on the label', () => {
		const body = renderWith(1, 1, {
			placed: [talk(1, 'confirmed', { submissionStatus: 'rejected', title: 'A declined keynote' })]
		});

		expect(body).toContain('data-testid="rejected-placement-badge"');
		expect(body).toContain('Declined');
		expect(body).toMatch(/data-testid="agenda-placed-session"[^>]*border-status-warn/);
		expect(body).not.toMatch(/data-testid="agenda-placed-session"[^>]*border-status-good/);
		// The range used to share the declined line's pixels on a short card.
		const cardStart = body.indexOf('data-testid="agenda-placed-session"');
		const cardEnd = body.indexOf('</button>', cardStart);
		const card = body.slice(cardStart, cardEnd);
		expect(card).not.toContain('09:00–09:30');
		expect(card).toContain('Declined');
	});
});

/**
 * #466 — colour already codes draft vs published on the cards (#219). The
 * legend names those colours so white cards among green are not a mystery,
 * and the fill confirmation says the new cards are invisible to the public.
 */
describe('agenda draft legend (#466)', () => {
	it('names draft against published next to the board', () => {
		const body = renderWith(1, 1, {
			placed: [
				{
					placementId: 1,
					submissionId: 1,
					title: 'Live',
					kind: 'session',
					status: 'confirmed',
					submissionStatus: 'accepted',
					trackName: null,
					formatName: 'Talk',
					minutes: 30,
					dayId: 1,
					roomId: 1,
					startMinutes: 540,
					endMinutes: 570,
					speakers: ['Ada']
				}
			]
		});

		expect(body).toContain('data-testid="agenda-publish-legend"');
		expect(body).toContain('Published — the public can see it');
		expect(body).toContain('Draft — only you can see it');
	});

	it('says fill-the-slots left drafts, not a live programme', () => {
		const body = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					speakerProfile: false,
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference,
					board: {
						days: [{ id: 1, date: '2027-05-10', position: 0 }],
						rooms: [{ id: 1, name: 'Room 1', position: 0 }],
						tracks: [],
						formats: [],
						placed: [],
						tray: [],
						conflicts: []
					},
					slots: [{ minutes: 540, label: '09:00' }]
				},
				form: { autoPlaced: 2 }
			} as never
		}).body;

		expect(body).toContain('data-testid="agenda-autoplace-result"');
		expect(body).toContain('Placed 2 sessions as drafts.');
		expect(body).toContain('invisible to the public until you publish');
	});
});
