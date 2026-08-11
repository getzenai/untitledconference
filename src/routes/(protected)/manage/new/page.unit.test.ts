/**
 * The way out of "New conference".
 *
 * This route renders outside AppSidebar, so nothing else on the screen carries
 * Home or Log out. The dead end that matters is the organizer who has no
 * organization yet: the form is replaced by a pointer to the previous step, and
 * before this the only remaining link went to My conferences — which is empty
 * for them and offers no logout either.
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
	it('offers Home and Log out beside the form', () => {
		const html = body(true);

		expect(html).toContain('data-testid="shell-account-links"');
		expect(html).toContain('href="/home"');
		expect(html).toContain('data-testid="shell-logout"');
		// The back link stays; it is a different destination, not a replacement.
		expect(html).toContain('href="/manage"');
	});

	it('offers them to an organizer who cannot create yet', () => {
		// The real dead end: no organization, so the form is gone entirely.
		const html = body(false);

		expect(html).toContain('/settings/organization/new');
		expect(html).toContain('data-testid="shell-account-links"');
		expect(html).toContain('data-testid="shell-logout"');
	});
});
