/**
 * The organizer shell must offer a real way out of a conference. "Switch
 * conference" that is only a label is the trap in #62; the control has to be a
 * link to /manage (which no longer redirects back into the only event).
 *
 * #410: that exit lives on ConferenceSidebar (a real Sidebar.Root), not a
 * handwritten <aside>. The account menu and the product home link belong to
 * AppSidebar, which the parent layout keeps mounted.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Host from './layout-ssr-host.svelte';

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

const layoutSource = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), '+layout.svelte'),
	'utf8'
);

const empty = (() => '') as unknown as import('svelte').Snippet;

const shell = (status: 'draft' | 'published' | 'archived') =>
	render(Host, {
		props: {
			data: {
				conference: { ...conference, status },
				user: { id: 'owner-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined }
			} as never,
			children: empty
		}
	}).body;

describe('shared sidebar architecture', () => {
	it('uses the shadcn conference rail instead of a handwritten aside', () => {
		expect(layoutSource).toContain('ConferenceSidebar');
		expect(layoutSource).not.toMatch(/<aside[\s>]/);
		// Account and home stay on AppSidebar so the two shells cannot drift (#127).
		expect(layoutSource).not.toContain('AccountMenu');
		expect(layoutSource).not.toContain('manage-home-link');
	});
});

describe('organizer shell exit', () => {
	it('links All conferences to /manage', () => {
		const body = shell('draft');

		expect(body).toContain('data-testid="switch-conference"');
		expect(body).toContain('href="/manage"');
		expect(body).toContain('All conferences');
		// Old label that looked clickable but described a no-op in earlier builds.
		expect(body).not.toContain('Switch conference');
		// The account menu is the parent's AppSidebar footer, not a second copy.
		expect(body).not.toContain('data-testid="account-menu-trigger"');
	});
});

/**
 * Draft is a property of the conference, not of one screen, so the shell carries
 * it. After creating a conference the organizer lands on Submissions, where
 * nothing used to say that the public site and the call for papers still answer
 * 404 — the switch lives in Settings, and only Settings knew it existed.
 */
describe('draft state in the shell', () => {
	it('shows the draft state on every organizer page, pointing at the switch', () => {
		const body = shell('draft');

		expect(body).toContain('data-testid="draft-badge"');
		// The badge is only worth anything if it leads to the control that changes it.
		expect(body).toContain('href="/manage/devflow-2028/settings"');
		expect(body).toContain('not public yet');
	});

	it('says nothing once the conference is live', () => {
		const body = shell('published');

		expect(body).not.toContain('data-testid="draft-badge"');
		expect(body).not.toContain('not public yet');
	});

	/**
	 * #474: archived wore the draft badge, so the chrome claimed a finished
	 * conference had never been public.
	 */
	it('says archived, not draft, once the conference is archived', () => {
		const body = shell('archived');

		expect(body).toContain('data-testid="draft-badge"');
		expect(body).toContain('Archived');
		expect(body).not.toContain('not public yet');
	});

	/** The way out to the public site belongs to the shell, on every page. */
	it('offers the public site from the conference rail', () => {
		const body = shell('published');

		expect(body).toContain('data-testid="view-public-site"');
		expect(body).toContain('href="/c/devflow-2028"');
	});

	/**
	 * #474: the link pointed at /c/<slug> whatever the status, so on a draft the
	 * app sent the organizer into its own 404 — which then told them the address
	 * was wrong.
	 */
	it('offers no public-site link while there is no public site', () => {
		for (const status of ['draft', 'archived'] as const) {
			const body = shell(status);

			expect(body).not.toContain('href="/c/devflow-2028"');
			expect(body).toContain('data-testid="public-site-unavailable"');
			expect(body).toContain('Settings');
		}
	});
});

/**
 * Labels name the work, not only the route. An agent hunting "scorecard" or
 * "reviewer pool" used to find neither word on the rail.
 */
describe('abstract-management labels on the rail', () => {
	it('names scorecards and the reviewer pool on the destinations that hold them', () => {
		const body = shell('draft');

		expect(body).toContain('Rounds &amp; scorecards');
		expect(body).toContain('href="/manage/devflow-2028/rounds"');
		expect(body).toContain('Reviewer pool');
		expect(body).toContain('href="/manage/devflow-2028/people"');
		// Old vague labels that hid the work behind a second click.
		expect(body).not.toContain('>Review rounds<');
		expect(body).not.toContain('>Team &amp; reviewers<');
	});
});
