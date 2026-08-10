/** A single decision is saved before, and independently from, its notification. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	status: 'published',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	reviewVisibility: 'open',
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

function renderPage(status: 'accepted' | 'submitted', notificationStatus: null | 'sent' = null) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submission: {
					id: 1,
					title: 'A deliberate decision',
					abstract: 'An abstract.',
					keyTakeaway: null,
					audienceLevel: null,
					status,
					contentApproval: 'pending',
					submittedAt: new Date('2027-01-02T00:00:00Z'),
					decidedAt: status === 'accepted' ? new Date('2027-01-03T00:00:00Z') : null,
					track: null,
					sessionFormat: null,
					sessionMinutes: null,
					sponsorTier: null,
					sponsorNote: null,
					speakers: [],
					answers: [],
					reviews: [],
					score: null,
					placements: []
				},
				notificationStatus
			} as PageData,
			form: null
		}
	}).body;
}

describe('organizer submission detail decision workflow', () => {
	it('renders separate decide and notify forms and names the boundary', () => {
		const body = renderPage('accepted');

		expect(body).toContain('action="?/decide"');
		expect(body).toContain('action="?/notify"');
		expect(body).toContain('Saving Accept, Waitlist or Decline does not notify speakers');
		expect(body).toContain('Decision saved. Speakers have not been notified.');
		expect(body).toContain('Notify speakers of decision');
		expect(body).not.toContain('queue the decision email');
	});

	it('shows the current notification state and blocks notifying an undecided submission', () => {
		expect(renderPage('accepted', 'sent')).toContain('Decision notification sent.');

		const undecided = renderPage('submitted');
		expect(undecided).toContain('Choose a decision before notifying speakers.');
		const notifyForm = undecided.slice(undecided.indexOf('action="?/notify"'));
		expect(notifyForm).toContain('disabled=""');
		expect(notifyForm).toContain('Notify speakers of decision');
	});
});
