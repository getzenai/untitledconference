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
		expect(html).not.toContain('data-testid="shell-account-links"');
		expect(html).not.toContain('data-testid="shell-logout"');
	});

	it('keeps the organization prerequisite inside the same shared shell', () => {
		const html = body(false);

		expect(html).toContain('/settings/organization/new');
		expect(html).not.toContain('data-testid="shell-account-links"');
	});

	it('points the organizer at Settings and the call for papers after create', () => {
		const html = body(true);

		expect(html).toContain('Settings next');
		expect(html).toContain('call for papers');
	});
});
