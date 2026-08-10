/**
 * Reviewer visibility belongs with the committee (#63), not conference structure.
 */
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

describe('team & reviewers page', () => {
	it('hosts review visibility and not room/track/format forms', () => {
		const { body } = render(Page, {
			props: {
				data: {
					user: { id: 'organizer-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined },
					conference
				} as never,
				form: null
			}
		});

		expect(body).toContain('data-testid="people-review-visibility"');
		expect(body).toContain('What reviewers see of each other');
		expect(body).toContain('action="?/reviewVisibility"');
		expect(body).not.toContain('action="?/addRoom"');
		expect(body).not.toContain('Session formats');
	});
});
