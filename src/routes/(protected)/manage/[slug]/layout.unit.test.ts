/**
 * The organizer shell must offer a real way out of a conference. "Switch
 * conference" that is only a label is the trap in #62; the control has to be a
 * link to /manage (which no longer redirects back into the only event).
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Layout from './+layout.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/manage/devflow-2028/dashboard') }
}));

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

describe('organizer shell exit', () => {
	it('links Switch/All conferences to /manage and home to /home', () => {
		const empty = (() => '') as unknown as import('svelte').Snippet;
		const { body } = render(Layout, {
			props: {
				data: {
					conference,
					user: { id: 'owner-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined }
					// Layout props are looser than the full PageData tree; cast once.
				} as never,
				children: empty
			}
		});

		expect(body).toContain('data-testid="switch-conference"');
		expect(body).toContain('href="/manage"');
		expect(body).toContain('All conferences');
		expect(body).toContain('data-testid="manage-home-link"');
		expect(body).toContain('href="/home"');
		expect(body).toContain('Back to home');
		// Old label that looked clickable but described a no-op in earlier builds.
		expect(body).not.toContain('Switch conference');
	});
});
