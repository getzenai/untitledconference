import { describe, expect, it } from 'vitest';
import {
	agendaReadyLine,
	autoPlaceResult,
	classifyAcceptedTalk,
	dashboardSchedulingEmpty,
	dashboardSchedulingHeadline,
	dashboardSchedulingLabel,
	dashboardSchedulingSubhead,
	dashboardSchedulingTile,
	notPublished,
	placementHasSlot,
	PROGRAM_LEGEND,
	PROGRAM_WORDS
} from './program-states';

describe('program-states (#466)', () => {
	const mixed = { unplaced: 1, draft: 1 };

	it('names the three states once', () => {
		expect(PROGRAM_WORDS).toEqual({
			unplaced: 'unplaced',
			draft: 'draft',
			published: 'published'
		});
		expect(PROGRAM_LEGEND.published).toMatch(/public can see/);
		expect(PROGRAM_LEGEND.draft).toMatch(/only you/);
	});

	it('dashboard counts unplaced + draft as not yet published', () => {
		expect(notPublished(mixed)).toBe(2);
		expect(dashboardSchedulingHeadline(mixed)).toBe('2 accepted not yet published');
		expect(dashboardSchedulingTile(mixed)).toBe('2 not yet published');
		expect(dashboardSchedulingSubhead(mixed)).toBe('1 draft · 1 unscheduled');
		expect(dashboardSchedulingLabel('unplaced')).toBe('Unscheduled');
		expect(dashboardSchedulingLabel('tentative')).toBe('Draft');
	});

	it('agenda names which set it is counting', () => {
		expect(agendaReadyLine({ unplaced: 1, draft: 1, placed: 1 })).toBe('1 talk is unscheduled.');
		expect(agendaReadyLine({ unplaced: 0, draft: 2, placed: 2 })).toBe(
			'Every accepted talk has a slot. 2 are still drafts.'
		);
		expect(agendaReadyLine({ unplaced: 0, draft: 0, placed: 2 })).toBe(
			'Every accepted talk has a published slot.'
		);
	});

	it('does not call a draft-only board finished', () => {
		const draftsOnly = agendaReadyLine({ unplaced: 0, draft: 2, placed: 2 });
		expect(draftsOnly).not.toBe('Every accepted talk has a slot.');
		expect(draftsOnly).toContain(PROGRAM_WORDS.draft);
		expect(dashboardSchedulingEmpty(2)).toBe('Every accepted talk is published.');
	});

	it('classifies the accept-path row as unplaced, not draft', () => {
		// `putInAgendaTray` writes exactly this: tentative, no day, no room, no time.
		const parked = {
			status: 'tentative',
			kind: 'session',
			dayId: null,
			roomId: null,
			startsAt: null
		};
		expect(placementHasSlot(parked)).toBe(false);
		expect(classifyAcceptedTalk([parked])).toBe('unplaced');
		expect(classifyAcceptedTalk([])).toBe('unplaced');
		expect(
			classifyAcceptedTalk([
				{
					status: 'tentative',
					kind: 'session',
					dayId: 1,
					roomId: 1,
					startsAt: new Date('2027-05-12T09:00:00Z')
				}
			])
		).toBe('draft');
		expect(
			classifyAcceptedTalk([
				{
					status: 'confirmed',
					kind: 'session',
					dayId: 1,
					roomId: 1,
					startsAt: new Date('2027-05-12T09:00:00Z')
				}
			])
		).toBe('published');
	});

	it('does not let a board of only breaks claim the talks are published', () => {
		expect(agendaReadyLine({ unplaced: 0, draft: 0, placed: 0 })).toBe(
			'Nothing has been accepted yet, so there is nothing to schedule.'
		);
	});

	it('says fill-the-slots left drafts, not a live programme', () => {
		expect(autoPlaceResult(2)).toBe(
			'Placed 2 talks as drafts. They are invisible to the public until you publish. Move anything you disagree with.'
		);
		expect(autoPlaceResult(1)).toContain('as drafts');
		expect(autoPlaceResult(0)).toContain('Nothing could be placed');
	});
});
