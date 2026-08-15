/**
 * The page-specific way back from "New conference". Home and account actions
 * belong to the shared sidebar and must not be duplicated in page content.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

/** The layout fields the page's `data` type carries but this page never reads. */
const layoutData = {
	user: { id: 'owner-1', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined }
};

function body(canCreate: boolean) {
	// `form` is null until the action has answered; these render the first paint.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(Page, { props: { data: { ...layoutData, canCreate } as any, form: null } }).body;
}

describe('new conference', () => {
	it('keeps the page-specific way back without duplicating account actions', () => {
		const html = body(true);

		expect(html).toContain('href="/manage"');
		expect(html).toContain('New event');
		expect(html).toContain('My events');
		expect(html).not.toContain('New conference');
		expect(html).not.toContain('My conferences');
		expect(html).not.toContain('data-testid="account-menu-trigger"');
	});

	it('keeps the organization prerequisite inside the same shared shell', () => {
		const html = body(false);

		expect(html).toContain('/settings/organization/new');
		expect(html).not.toContain('data-testid="account-menu-trigger"');
	});

	it('points the organizer at Settings and the call for papers after create', () => {
		const html = body(true);

		expect(html).toContain('Settings next');
		expect(html).toContain('call for papers');
	});

	/**
	 * #436: Name is required in the markup and on the server; the label used
	 * to look optional. Slug and dates are optional — the explorer's
	 * "almost all required" is not what the action checks.
	 */
	it('marks Name required and names why create cannot run on first paint', () => {
		const html = body(true);

		expect(html).toContain('Name');
		expect(html).toMatch(/Name<!--[^>]*--><span class="text-status-bad">\u00a0\*/);
		expect(html).toContain('data-testid="create-block-reason"');
		expect(html).toContain('Name is required.');
		// The button stays enabled so a no-JS submit still posts; HTML required
		// and the server reason are the lock. The org form is the one that greys.
		expect(html).toContain('Create event');
	});
});
