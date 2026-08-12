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
		// Logout outside the sidebar shell (Sol #80 review).
		expect(body).toContain('data-testid="shell-logout"');
		expect(body).toContain('Log out');
		// Old label that looked clickable but described a no-op in earlier builds.
		expect(body).not.toContain('Switch conference');
	});
});

/**
 * Draft is a property of the conference, not of one screen, so the shell carries
 * it. After creating a conference the organizer lands on Submissions, where
 * nothing used to say that the public site and the call for papers still answer
 * 404 — the switch lives in Settings, and only Settings knew it existed.
 */
describe('draft state in the shell', () => {
	const empty = (() => '') as unknown as import('svelte').Snippet;

	const shell = (status: 'draft' | 'published') =>
		render(Layout, {
			props: {
				data: {
					conference: { ...conference, status },
					user: { id: 'owner-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined }
				} as never,
				children: empty
			}
		}).body;

	it('shows the draft state on every organizer page, pointing at the switch', () => {
		const body = shell('draft');

		expect(body).toContain('data-testid="draft-badge"');
		expect(body).toContain('data-testid="draft-badge-mobile"');
		// The badge is only worth anything if it leads to the control that changes it.
		expect(body).toContain('href="/manage/devflow-2028/settings"');
		expect(body).toContain('not public yet');
	});

	it('says nothing once the conference is live', () => {
		const body = shell('published');

		expect(body).not.toContain('data-testid="draft-badge"');
		expect(body).not.toContain('not public yet');
	});

	/** The way out to the public site belongs to the shell, on every page and on a phone. */
	it('offers the public site from the shell in both layouts', () => {
		const body = shell('published');

		expect(body).toContain('data-testid="view-public-site"');
		expect(body).toContain('data-testid="view-public-site-mobile"');
		expect(body).toContain('href="/c/devflow-2028"');
	});
});

/**
 * Labels name the work, not only the route. An agent hunting "scorecard" or
 * "reviewer pool" used to find neither word on the rail.
 */
describe('abstract-management labels on the rail', () => {
	it('names scorecards and the reviewer pool on the destinations that hold them', () => {
		const empty = (() => '') as unknown as import('svelte').Snippet;
		const { body } = render(Layout, {
			props: {
				data: {
					conference,
					user: { id: 'owner-1', name: 'Jordan' },
					impersonating: null,
					analytics: { apiKey: undefined, host: undefined }
				} as never,
				children: empty
			}
		});

		expect(body).toContain('Rounds &amp; scorecards');
		expect(body).toContain('href="/manage/devflow-2028/rounds"');
		expect(body).toContain('Reviewer pool');
		expect(body).toContain('href="/manage/devflow-2028/people"');
		// Old vague labels that hid the work behind a second click.
		expect(body).not.toContain('>Review rounds<');
		expect(body).not.toContain('>Team &amp; reviewers<');
	});
});
