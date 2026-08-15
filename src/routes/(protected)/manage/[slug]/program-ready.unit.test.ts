/**
 * #466 — dashboard and agenda used to answer "is the programme finished?"
 * with opposite yes/no. They still count different sets (not-published vs
 * unplaced); this pins that both screens name the set, with the same words.
 *
 * The dashboard `state` here is what `schedulingGap` actually returns after
 * splitting on the slot: a tray talk is `unplaced`, a white card is `tentative`.
 * The accept-path shape (tentative row, no day/room) is pinned in
 * `program-states.unit.test.ts` and `dashboard.integration.test.ts`.
 */
import {
	agendaReadyLine,
	dashboardSchedulingHeadline,
	dashboardSchedulingSubhead,
	PROGRAM_LEGEND,
	PROGRAM_WORDS
} from '$lib/conference/program-states';
import type { BoardSession } from '$lib/server/conference/agenda';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Agenda from './agenda/+page.svelte';
import Dashboard from './dashboard/+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	status: 'published' as const,
	statusBeforeArchive: null,
	listedPublicly: false,
	slotCapacity: null,
	predecessorConferenceId: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const emptyDashboard = {
	mode: 'measure' as const,
	setup: { rooms: 2, tracks: 2, cfpOpen: true, submissions: 1 },
	decisions: { undecided: 0, unreviewed: 0, items: [] },
	tasks: { open: 0, overdue: 0, dueSoon: 0, items: [] },
	mail: { queued: 0, sent: 0, failed: 0, items: [] },
	reviews: { assigned: 0, submitted: 0, outstanding: 0, items: [] },
	inconsistencies: { count: 0, items: [] },
	submissionsOverTime: []
};

const talk = (id: number, over: Partial<BoardSession> = {}): BoardSession => ({
	placementId: id,
	submissionId: id,
	title: `Talk ${id}`,
	kind: 'session',
	status: 'tentative',
	submissionStatus: 'accepted',
	trackName: null,
	formatName: 'Talk',
	minutes: 30,
	dayId: 1,
	roomId: 1,
	startMinutes: 540,
	endMinutes: 570,
	speakers: ['Ada'],
	...over
});

function dashboardBody(scheduling: {
	accepted: number;
	unplaced: number;
	tentative: number;
	items: { id: number; title: string; state: 'unplaced' | 'tentative' }[];
}) {
	return render(Dashboard, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				mailDeliveryConfigured: true,
				dashboard: { ...emptyDashboard, scheduling }
			},
			form: null
		} as never
	}).body;
}

function agendaBody(board: { placed?: BoardSession[]; tray?: BoardSession[] }) {
	return render(Agenda, {
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
					placed: board.placed ?? [],
					tray: board.tray ?? [],
					conflicts: []
				},
				slots: [{ minutes: 540, label: '09:00' }]
			},
			form: null
		} as never
	}).body;
}

describe('dashboard vs agenda (#466)', () => {
	it('pins both screens on one unplaced and one tentative', () => {
		const counts = { unplaced: 1, draft: 1 };
		const dashboard = dashboardBody({
			accepted: 2,
			unplaced: 1,
			tentative: 1,
			items: [
				{ id: 1, title: 'Still in the tray', state: 'unplaced' },
				{ id: 2, title: 'Draft on the grid', state: 'tentative' }
			]
		});
		const agenda = agendaBody({
			tray: [talk(1, { dayId: null, roomId: null, startMinutes: null, endMinutes: null })],
			placed: [talk(2)]
		});

		const dashLine = dashboardSchedulingHeadline(counts);
		const dashSplit = dashboardSchedulingSubhead(counts);
		const agendaLine = agendaReadyLine({ unplaced: 1, draft: 1, placed: 1 });

		expect(dashLine).toBe('2 accepted not yet published');
		expect(dashSplit).toBe('1 draft · 1 unscheduled');
		expect(agendaLine).toBe('1 talk is unscheduled.');

		expect(dashboard).toContain(dashLine);
		expect(dashboard).toContain(dashSplit);
		expect(dashboard).toContain('Unscheduled');
		expect(dashboard).toContain('Draft');
		expect(dashboard).not.toContain('confirmed slot');
		expect(dashboard).not.toContain('Every accepted talk is published.');

		expect(agenda).toContain(agendaLine);
		expect(agenda).toContain(PROGRAM_LEGEND.published);
		expect(agenda).toContain(PROGRAM_LEGEND.draft);
		expect(agenda).not.toContain('Every accepted talk has a published slot.');
		expect(agenda).not.toContain('Every accepted talk has a slot.</');

		// Same talk state, same word on both screens (#476). Draft/published
		// stay on the agenda legend; the tray is Unscheduled, not Unplaced.
		expect(dashboard.toLowerCase()).toContain('unscheduled');
		expect(dashboard.toLowerCase()).toContain(PROGRAM_WORDS.draft);
		expect(agenda.toLowerCase()).toContain('unscheduled');
		expect(agenda.toLowerCase()).toContain(PROGRAM_WORDS.draft);
		expect(agenda.toLowerCase()).toContain(PROGRAM_WORDS.published);
	});

	it('after accept, both screens count the tray as unplaced — not draft', () => {
		const dashboard = dashboardBody({
			accepted: 2,
			unplaced: 2,
			tentative: 0,
			items: [
				{ id: 1, title: 'Just accepted', state: 'unplaced' },
				{ id: 2, title: 'Also accepted', state: 'unplaced' }
			]
		});
		const agenda = agendaBody({
			tray: [
				talk(1, { dayId: null, roomId: null, startMinutes: null, endMinutes: null }),
				talk(2, { dayId: null, roomId: null, startMinutes: null, endMinutes: null })
			],
			placed: []
		});

		expect(dashboard).toContain('2 accepted not yet published');
		expect(dashboard).toContain('0 drafts · 2 unscheduled');
		expect(dashboard).toContain('Unscheduled');
		expect(dashboard).not.toContain('Draft');
		expect(agenda).toContain('2 talks are unscheduled.');
		expect(agenda).not.toContain('still drafts');
	});

	it('does not let an empty tray claim the programme is finished while drafts sit on the grid', () => {
		const dashboard = dashboardBody({
			accepted: 2,
			unplaced: 0,
			tentative: 2,
			items: [
				{ id: 1, title: 'Draft one', state: 'tentative' },
				{ id: 2, title: 'Draft two', state: 'tentative' }
			]
		});
		const agenda = agendaBody({
			tray: [],
			placed: [talk(1), talk(2, { startMinutes: 570, endMinutes: 600 })]
		});

		expect(dashboard).toContain('2 accepted not yet published');
		expect(dashboard).toContain('2 drafts · 0 unscheduled');
		expect(agenda).toContain('Every accepted talk has a slot. 2 are still drafts.');
		expect(agenda).not.toMatch(/>Every accepted talk has a slot\.</);
	});
});
