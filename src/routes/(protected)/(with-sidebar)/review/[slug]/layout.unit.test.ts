/**
 * Conference review context is local to this header. Cross-role navigation and
 * account actions belong to the shared application sidebar.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Layout from './+layout.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'DevFlow Conf',
	slug: 'devflow-2028',
	status: 'draft' as const,
	venue: 'Berlin',
	startsOn: '2028-05-12',
	endsOn: '2028-05-14',
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

describe('reviewer conference header', () => {
	it('identifies the review context without duplicating sidebar account actions', () => {
		const empty = (() => '') as unknown as import('svelte').Snippet;
		const { body } = render(Layout, {
			props: {
				data: {
					conference,
					user: { id: 'reviewer-1', name: 'Sam' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined }
				} as never,
				children: empty
			}
		});

		expect(body).not.toContain('data-testid="shell-account-links"');
		expect(body).not.toContain('data-testid="shell-logout"');
		expect(body).toContain('Review committee');
	});
});
