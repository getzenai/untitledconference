/**
 * Review shell is outside (with-sidebar). After #62 removed the home logout,
 * this layout must still offer Home + Log out — a one-conference reviewer is
 * redirected straight here and never sees NavUser.
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

describe('reviewer shell account affordance', () => {
	it('renders Home and Log out outside the app sidebar', () => {
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

		expect(body).toContain('data-testid="shell-account-links"');
		expect(body).toContain('data-testid="shell-home-link"');
		expect(body).toContain('data-testid="shell-logout"');
		expect(body).toContain('href="/home"');
		expect(body).toContain('Log out');
		expect(body).toContain('Review committee');
	});
});
