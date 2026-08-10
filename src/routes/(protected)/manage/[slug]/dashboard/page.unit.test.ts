import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import Page from './+page.svelte';

const conference = {
	id: 1,
	organizationId: 'org-test',
	name: 'Test Conf',
	slug: 'test-conf',
	venue: null,
	startsOn: null,
	endsOn: null,
	cfpIntro: null,
	status: 'published' as const,
	reviewVisibility: 'open' as const,
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

const emptyDashboard = {
	decisions: { undecided: 0, unreviewed: 0, items: [] },
	scheduling: { accepted: 0, unplaced: 0, tentative: 0, items: [] },
	tasks: { open: 0, overdue: 0, dueSoon: 0, items: [] },
	mail: { queued: 0, sent: 0, failed: 0, items: [] },
	inconsistencies: { count: 0, items: [] }
};

function page(outstanding: number, reminderStatus: null | 'queued' = null) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				dashboard: {
					...emptyDashboard,
					reviews: {
						assigned: 3,
						submitted: 3 - outstanding,
						outstanding,
						items: [
							{
								userId: 'reviewer-1',
								name: 'Riley Reviewer',
								email: 'riley@example.com',
								assigned: 3,
								submitted: 3 - outstanding,
								outstanding,
								reminderStatus
							}
						]
					}
				}
			} as PageData,
			form: null
		}
	}).body;
}

describe('per-reviewer progress', () => {
	it('shows assigned versus submitted and exposes a reminder for outstanding work', () => {
		const body = page(2);

		expect(body).toContain('Reviewer progress');
		expect(body).toContain('1/3 submitted');
		expect(body).toContain('action="?/remindReviewer"');
		expect(body).toContain('Send reminder');
	});

	it('replaces the action with the observable reminder state', () => {
		const body = page(2, 'queued');

		expect(body).toContain('Reminder queued');
		expect(body).not.toContain('Send reminder');
	});
});
