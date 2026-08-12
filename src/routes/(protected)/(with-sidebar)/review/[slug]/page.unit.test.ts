/**
 * The reviewer's queue, after #82 moved its two sorts onto the columns they order.
 *
 * The screen used to carry the sort twice — a row of tabs above the table saying
 * "fewest reviews first", and a Reviews column that did not look clickable — and the
 * reader had to join them up. One representation now, and these tests pin the parts
 * that are easy to get wrong when a control becomes a table header: the direction
 * each sort actually means, and that the link is still a link.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/review/test-conf') }
}));

const row = (
	submissionId: number,
	title: string,
	reviewsSubmitted: number,
	rounds: string[] = ['Round 1']
) => ({
	submissionId,
	title,
	track: 'Platform',
	rounds,
	reviewsSubmitted,
	reviewsAssigned: 3,
	score: 4.2,
	ownReviewSubmitted: false,
	withdrawn: false
});

function renderQueue(queue: ReturnType<typeof row>[], sort: 'coverage' | 'score' = 'coverage') {
	return render(Page, {
		props: {
			data: {
				user: { id: 'reviewer-1', name: 'Robin' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference: {
					id: 1,
					name: 'Test Conf',
					slug: 'test-conf',
					reviewVisibility: 'open'
				},
				queue,
				sort
			} as unknown as PageData
		}
	}).body;
}

function renderPage(sort: 'coverage' | 'score' = 'coverage') {
	return renderQueue([row(1, 'A talk', 0), row(2, 'Another talk', 2)], sort);
}

describe('the review queue sorts from its column headers', () => {
	it('says which direction each sort means, because they differ', () => {
		const coverage = renderPage('coverage');

		// `coverage` is fewest reviews first and `score` is highest first. A header
		// that reported both as the same direction would be telling a screen reader
		// the opposite of what the table shows on one of the two columns.
		expect(coverage).toContain('aria-sort="ascending"');
		expect(coverage).not.toContain('aria-sort="descending"');

		const score = renderPage('score');
		expect(score).toContain('aria-sort="descending"');
		expect(score).not.toContain('aria-sort="ascending"');
	});

	it('keeps each sort a link, so the view stays sendable', () => {
		const body = renderPage('coverage');

		expect(body).toContain('href="/review/test-conf?sort=coverage"');
		expect(body).toContain('href="/review/test-conf?sort=score"');
		// Exactly one header is marked current: two would mean the page cannot say
		// what it is showing.
		expect(body.match(/aria-current="true"/g) ?? []).toHaveLength(1);
	});

	it('has stopped saying the same thing in two places', () => {
		const body = renderPage('coverage');

		// The tab row is gone; its label survives once, as the sentence that explains
		// what the reader is looking at.
		expect(body.match(/Fewest reviews first/g) ?? []).toHaveLength(1);
		expect(body).toContain('The working list');
	});
});

describe('a submission held in more than one round', () => {
	it('names the rounds on the row, so one filed review does not look like done', () => {
		const body = renderQueue([row(1, 'Held twice', 0, ['Round 1', 'Blind round'])]);

		expect(body).toContain('Round 1 · Blind round');
	});

	it('stays quiet when there is only one round to name', () => {
		expect(renderQueue([row(1, 'Held once', 0)])).not.toContain('Round 1 ·');
	});
});

/**
 * A talk the speaker took back (RV-P1-01). It stood in the queue as "To do" with a
 * live review form — the reviewer was being asked to spend an hour on a talk that
 * had left.
 */
describe('a withdrawn talk', () => {
	const withdrawn = (over: Partial<ReturnType<typeof row>> = {}) => ({
		...row(3, 'A compiler in an afternoon', 0),
		withdrawn: true,
		...over
	});

	it('is labelled withdrawn rather than asked for', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).toContain('Withdrawn');
		// The exact regression: it must not still read as work owed.
		expect(body).not.toContain('To do');
	});

	it('is out of the count, so a finished queue reads finished', () => {
		// One real talk, reviewed; one withdrawn. The reviewer owes nothing.
		const body = renderQueue([
			{ ...row(1, 'Reviewed talk', 2), ownReviewSubmitted: true },
			withdrawn()
		]);

		expect(body).toContain('1 of 1 reviewed');
		expect(body).not.toContain('1 of 2 reviewed');
	});

	it('still lists the talk, because vanishing looks like never-assigned', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).toContain('A compiler in an afternoon');
	});

	it('does not borrow the "Reviewed" badge from a review this person never filed', () => {
		const body = renderQueue([withdrawn()]);

		expect(body).not.toContain('Reviewed<');
	});
});
