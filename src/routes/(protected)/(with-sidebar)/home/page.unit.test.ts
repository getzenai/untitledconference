/**
 * /home is the post-login hub. It used to ship starter chrome ("Where do you
 * want to go?" plus a second Logout) that made the product look unfinished.
 * These pins hold the role destinations and refuse the leftover copy.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const layoutData = {
	user: { id: 'user-1', email: 'jordan@example.test', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined }
};

function body(
	onboarding: null | {
		pendingInvitationCount: number;
		hasOrganization: boolean;
		href: string;
	}
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(Page, { props: { data: { ...layoutData, onboarding } as any } }).body;
}

describe('home hub', () => {
	it('lists the three roles and drops the starter leftover', () => {
		const html = body(null);

		expect(html).toContain('data-testid="home-dashboard"');
		expect(html).toContain('Welcome, jordan@example.test');
		expect(html).toContain('href="/manage"');
		expect(html).toContain('Organizing');
		expect(html).toContain('href="/portal"');
		expect(html).toContain('Speaking');
		expect(html).toContain('href="/review"');
		expect(html).toContain('Reviewing');

		// The three things Fabian's review called out as starter residue.
		expect(html).not.toContain('Where do you want to go?');
		expect(html).not.toMatch(/>\s*Logout\s*</);
		expect(html).not.toContain('Protected Dashboard');
	});

	it('surfaces unfinished onboarding without burying the role cards', () => {
		const html = body({
			pendingInvitationCount: 2,
			hasOrganization: false,
			href: '/onboarding/invitations'
		});

		expect(html).toContain('pending invitation');
		expect(html).toContain('/onboarding/invitations');
		expect(html).toContain('Review invitations');
		expect(html).toContain('href="/manage"');
	});
});
