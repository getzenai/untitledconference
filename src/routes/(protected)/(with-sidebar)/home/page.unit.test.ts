/**
 * /home is the post-login hub. It used to ship starter chrome ("Where do you
 * want to go?" plus a second Logout) and three static role cards. These pins
 * hold the product hub: events, open work, sourcing jump — and refuse leftovers.
 */
import type { HomeDashboard } from '$lib/server/conference/home';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const layoutData = {
	user: { id: 'user-1', email: 'jordan@example.test', name: 'Jordan' },
	impersonating: null,
	analytics: { apiKey: undefined, host: undefined }
};

const emptyHub: HomeDashboard = {
	events: [],
	canCreateEvent: true,
	canSourcing: false,
	openSubmissions: [],
	openTasks: [],
	openReviews: [],
	reviewConferences: []
};

function body(
	onboarding: null | {
		pendingInvitationCount: number;
		hasOrganization: boolean;
		href: string;
	},
	hub: typeof emptyHub | null = emptyHub
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return render(Page, { props: { data: { ...layoutData, onboarding, hub } as any } }).body;
}

describe('home hub', () => {
	it('drops starter leftovers and speaks product language', () => {
		const html = body(null);

		expect(html).toContain('data-testid="home-dashboard"');
		expect(html).toContain('Welcome, jordan@example.test');
		expect(html).toContain('Your events');
		expect(html).toContain('Create an event');

		expect(html).not.toContain('Where do you want to go?');
		expect(html).not.toMatch(/>\s*Logout\s*</);
		expect(html).not.toContain('Protected Dashboard');
		// Static role cards from the intermediate hub are gone.
		expect(html).not.toMatch(/href="\/manage"/);
		expect(html).not.toContain('>Organizing<');
		expect(html).not.toContain('>Speaking<');
		expect(html).not.toContain('>Reviewing<');
	});

	it('lists events without forcing a single-conference redirect target', () => {
		const html = body(null, {
			...emptyHub,
			events: [
				{
					id: 1,
					organizationId: 'org-1',
					name: 'DevFlow Summit',
					slug: 'devflow',
					status: 'published',
					startsOn: '2026-09-01',
					endsOn: '2026-09-02',
					venue: 'Berlin',
					createdAt: new Date('2026-01-01'),
					updatedAt: new Date('2026-01-01')
				} as never
			],
			canSourcing: true
		});

		expect(html).toContain('DevFlow Summit');
		expect(html).toContain('href="/manage/devflow/dashboard"');
		expect(html).toContain('All events');
		expect(html).toContain('href="/manage"');
		expect(html).toContain('Speaker sourcing');
		expect(html).toContain('data-testid="home-sourcing-link"');
		expect(html).toContain('href="/contacts"');
	});

	it('surfaces open reviews and proposals', () => {
		const html = body(null, {
			...emptyHub,
			canCreateEvent: false,
			// emptyHub arrays are never[]; pin shapes the same way events do above
			openReviews: [
				{
					submissionId: 42,
					title: 'Shipping faster with agents',
					conference: { slug: 'devflow', name: 'DevFlow Summit' }
				} as never
			],
			openSubmissions: [
				{
					id: 7,
					title: 'My draft talk',
					status: 'draft',
					submittedAt: null,
					decidedAt: null,
					isPrimary: true,
					conference: { slug: 'devflow', name: 'DevFlow Summit' }
				} as never
			],
			openTasks: [],
			reviewConferences: []
		});

		expect(html).toContain('Reviews waiting');
		expect(html).toContain('Shipping faster with agents');
		expect(html).toContain('href="/review/devflow/42"');
		expect(html).toContain('Your proposals');
		expect(html).toContain('My draft talk');
		expect(html).toContain('href="/portal/submissions/7"');
	});

	it('surfaces unfinished onboarding without burying the hub', () => {
		const html = body(
			{
				pendingInvitationCount: 2,
				hasOrganization: false,
				href: '/onboarding/invitations'
			},
			{ ...emptyHub, canCreateEvent: false }
		);

		expect(html).toContain('pending invitation');
		expect(html).toContain('/onboarding/invitations');
		expect(html).toContain('Review invitations');
		expect(html).toContain('Your events');
	});
});
