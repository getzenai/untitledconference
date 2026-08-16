/**
 * The store is one page's selection at a time. The cases that matter are the
 * seams: a page that has gone, and a page that is not the one asking.
 */
import { describe, expect, it } from 'vitest';
import { pageFocus, providePageFocus } from './page-focus.svelte';

const AGENDA = '/(protected)/manage/[slug]/agenda';
const REVIEW = '/(protected)/(with-sidebar)/review/[slug]/[submissionId]';

describe('page focus', () => {
	it('hands the panel what the current page published', () => {
		const stop = providePageFocus(AGENDA, { day: '2027-05-04' });
		expect(pageFocus(AGENDA)).toEqual({ day: '2027-05-04' });
		stop();
	});

	it('is empty for a page that published nothing', () => {
		expect(pageFocus(REVIEW)).toBeUndefined();
	});

	it('does not hand one page the selection of another', () => {
		const stop = providePageFocus(AGENDA, { day: '2027-05-04' });
		expect(pageFocus(REVIEW)).toBeUndefined();
		stop();
	});

	it('forgets the day when the board goes away', () => {
		const stop = providePageFocus(AGENDA, { day: '2027-05-04' });
		stop();
		expect(pageFocus(AGENDA)).toBeUndefined();
	});

	it('lets the page that arrived after keep its selection', () => {
		const stopAgenda = providePageFocus(AGENDA, { day: '2027-05-04' });
		const stopReview = providePageFocus(REVIEW, { roundId: 4 });
		// The board's effect tears down after the scorecard's has run.
		stopAgenda();
		expect(pageFocus(REVIEW)).toEqual({ roundId: 4 });
		stopReview();
	});
});
