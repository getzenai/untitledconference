/**
 * The two things this page got wrong on a real screen: it sat flush against the rail
 * with no padding, and a hundred speakers meant a hundred cards and no way to find
 * one. Both are invisible to every other test we have, so they get nailed down here.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open',
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const speaker = (id: number) => ({
	speakerProfileId: id,
	name: `Speaker ${id}`,
	email: `speaker${id}@example.test`,
	hasAccount: true,
	tasks: [
		{
			id: id * 10,
			title: `Slides ${id}`,
			kind: 'file_request',
			status: 'open',
			dueOn: null,
			fileCount: 0,
			latestFilename: null,
			latestApproval: null
		}
	],
	open: 1,
	waiting: 0,
	done: 0
});

const renderWith = (count: number) =>
	render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				speakers: Array.from({ length: count }, (_, i) => speaker(i + 1)),
				totals: { open: count, waiting: 0, done: 0, overdue: 0 }
			}
		}
	}).body;

describe('organizer speaker content layout', () => {
	it('gives the content a padded, bounded container instead of sitting flush against the rail', () => {
		const body = renderWith(3);

		// The header bar every other organizer page uses, then a body that is padded
		// and capped — the two properties Fabian's walkthrough found missing.
		expect(body).toMatch(/<div class="[^"]*border-b[^"]*px-6 py-5[^"]*"/);
		const container = body.match(/<div class="([^"]*max-w-5xl[^"]*)"/)?.[1];
		expect(container).toContain('px-6');
		expect(container).toContain('mx-auto');
	});

	it('offers a filter once the list is long enough to need one, and not before', () => {
		expect(renderWith(3)).not.toContain('data-testid="content-filter"');
		expect(renderWith(20)).toContain('data-testid="content-filter"');
	});
});
