/** The table must expose two distinct actions: decide now, notify later. */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/manage/test-conf/submissions') }
}));

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published' as const,
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const submission = (id: number, status: 'accepted' | 'submitted') => ({
	id,
	title: status === 'accepted' ? 'A decided talk' : 'An undecided talk',
	status,
	contentApproval: 'pending' as const,
	submittedAt: new Date('2027-01-02T00:00:00Z'),
	track: null,
	sessionFormat: null,
	sponsorTier: null,
	speakers: [
		{
			id: id + 10,
			name: 'Ada Speaker',
			jobTitle: null,
			company: null,
			headshotUrl: null,
			isPrimary: true,
			roleLabel: null
		}
	],
	score: null,
	reviewsSubmitted: 0,
	reviewsAssigned: 0
});

function renderPage(notificationStatus: null | 'queued' = null) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submissions: [submission(1, 'accepted'), submission(2, 'submitted')],
				pagination: { matching: 2, page: 1, pageSize: 50, pageCount: 1 },
				facets: { tracks: [], formats: [] },
				filters: {},
				sort: 'newest',
				counts: { total: 2, undecided: 1, unreviewed: 2 },
				notificationStatuses: { 1: notificationStatus, 2: null }
			} as PageData,
			form: null
		}
	}).body;
}

describe('organizer submission decisions', () => {
	it('keeps status changes and speaker notification as separate actions', () => {
		const body = renderPage();

		expect(body).toContain('action="?/decide"');
		expect(body).toContain('formaction="?/notify"');
		expect(body).toContain('Notify decisions');
		expect(body).toContain('Decisions do not notify speakers;');
		expect(body).toMatch(/notifications\s+are sent separately after the programme is checked\./);
		expect(body).not.toContain('automatically notif');
	});

	it('shows whether each current decision has been notified', () => {
		const unsent = renderPage();
		expect(unsent).toContain('Notification');
		expect(unsent).toContain('Not sent');
		expect(unsent).toContain('Not ready');

		expect(renderPage('queued')).toContain('Queued');
	});
});
