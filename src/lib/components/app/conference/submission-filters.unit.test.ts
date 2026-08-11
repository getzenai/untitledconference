/**
 * The filter row's wire, pinned across the change of control (#124).
 *
 * Every control here is a query parameter the loader reads. Swapping a native
 * `<select>` for the shadcn one changes what the organizer sees and nothing
 * else — the hidden input keeps the same `name` and the same option values —
 * but that is exactly the kind of change that silently stops a filter working
 * while every screenshot still looks right. So this pins the names and the
 * values, and only those.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SubmissionFilters from './submission-filters.svelte';

const facets = {
	tracks: [{ id: 3, name: 'Platform' }],
	formats: [{ id: 5, name: 'Workshop' }]
};

const body = (filters: Record<string, unknown> = {}) =>
	render(SubmissionFilters, {
		props: {
			facets,
			filters,
			sort: 'newest',
			clearHref: '/manage/devflow/submissions'
		}
	}).body;

describe('the submissions filter row', () => {
	it('posts the same parameters the loader reads', () => {
		const html = body();

		expect(html).toContain('name="q"');
		expect(html).toContain('name="track"');
		expect(html).toContain('name="format"');
		expect(html).toContain('name="status"');
		expect(html).toContain('name="needsReview"');
	});

	it('shows the chosen facet rather than the placeholder', () => {
		const html = body({ trackId: 3, sessionFormatId: 5 });

		expect(html).toContain('Platform');
		expect(html).toContain('Workshop');
		// The value the form would post, not just the label the organizer reads.
		expect(html).toMatch(/value="3"[^>]*name="track"|name="track"[^>]*value="3"/);
	});

	// "All tracks" clears the filter, so it has to be a pickable option and the
	// state the row starts in — a placeholder would show the same words and post
	// nothing back.
	it('starts on the clearing choice when nothing is filtered', () => {
		const html = body();

		expect(html).toContain('All tracks');
		expect(html).toContain('All formats');
	});
});
