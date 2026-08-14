import { describe, expect, it } from 'vitest';
import {
	agendaReadyLine,
	autoPlaceResult,
	dashboardSchedulingEmpty,
	dashboardSchedulingHeadline,
	dashboardSchedulingLabel,
	dashboardSchedulingSubhead,
	dashboardSchedulingTile,
	notPublished,
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
		expect(dashboardSchedulingSubhead(mixed)).toBe('1 draft · 1 unplaced');
		expect(dashboardSchedulingLabel('unplaced')).toBe('Unplaced');
		expect(dashboardSchedulingLabel('tentative')).toBe('Draft');
	});

	it('agenda names which set it is counting', () => {
		expect(agendaReadyLine({ unplaced: 1, draft: 1, placed: 1 })).toBe(
			'1 unplaced talk needs a slot.'
		);
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

	it('says fill-the-slots left drafts, not a live programme', () => {
		expect(autoPlaceResult(2)).toBe(
			'Placed 2 sessions as drafts. They are invisible to the public until you publish. Move anything you disagree with.'
		);
		expect(autoPlaceResult(1)).toContain('as drafts');
		expect(autoPlaceResult(0)).toContain('Nothing could be placed');
	});
});
