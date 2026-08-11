/** A single decision is saved before, and independently from, its notification. */
import type { NotificationResult } from '$lib/server/conference/decision-notifications';
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

function renderPage(
	status: 'accepted' | 'submitted',
	notificationStatus: null | 'queued' | 'sent' | 'failed' = null,
	reviewerStatus: null | 'assigned' | 'submitted' = null,
	ownReview: null | { reviewId: number; status: 'assigned' | 'submitted' } = null,
	rounds: 'one' | 'none' = 'one',
	notificationResult: NotificationResult | null = null
) {
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
				notificationStatus,
				assignmentRounds:
					rounds === 'none'
						? []
						: [
								{
									id: 10,
									name: 'Round 1',
									reviewers: [
										{
											userId: 'reviewer-1',
											name: 'Riley Reviewer',
											email: 'riley@example.com',
											status: reviewerStatus,
											eligible: true
										}
									]
								}
							],
				ownReview
			} as PageData,
			form: notificationResult ? { notificationResult } : null
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
		const failed = renderPage('accepted', 'failed');
		expect(failed).toContain('Decision notification failed. Notify again to retry.');
		expect(failed).toContain('>Notify again<');
		expect(failed).not.toContain('>Notify speakers of decision<');

		const undecided = renderPage('submitted');
		expect(undecided).toContain('Choose a decision before notifying speakers.');
		const notifyForm = undecided.slice(undecided.indexOf('action="?/notify"'));
		expect(notifyForm).toContain('disabled=""');
		expect(notifyForm).toContain('Notify speakers of decision');
	});

	it('renders a failed dispatch as an alert instead of a green success', () => {
		const body = renderPage('accepted', 'failed', null, null, 'one', {
			notified: 1,
			alreadyNotified: 0,
			notDecided: 0,
			withoutEmail: 0,
			emailsQueued: 1,
			dispatch: { sent: 0, failed: 1, remaining: 0, disabled: false }
		});

		expect(body).toContain('1 email failed to send; use Notify again to retry.');
		expect(body).toContain('text-status-bad');
		expect(body).toContain('role="alert"');
	});

	it('offers an explicit organizer assignment action', () => {
		const body = renderPage('submitted');

		expect(body).toContain('Reviewer assignments');
		expect(body).toContain('Riley Reviewer');
		expect(body).toContain('action="?/assignment"');
		expect(body).toContain('value="assign"');
	});

	it('preserves a submitted review instead of offering destructive unassignment', () => {
		const body = renderPage('submitted', null, 'submitted');

		expect(body).toContain('Submitted');
		expect(body).not.toContain('value="unassign"');
	});
});

/**
 * The way from a submission to the organizer's own review of it (#57).
 *
 * The form itself stays on the reviewer surface — it carries the round's criteria,
 * the blind-mode rules and the recusal path, and a second copy here would be a
 * second implementation of #33's guarantees. What this screen owes is the door,
 * and an honest sentence when there is none.
 */
describe('the organizer own-review door', () => {
	it('offers the reviewer form when a review of theirs is waiting', () => {
		const body = renderPage('submitted', null, null, { reviewId: 5, status: 'assigned' });

		expect(body).toContain('data-testid="own-review"');
		expect(body).toContain('href="/review/test-conf/1"');
		expect(body).toContain('Write your review');
		expect(body).toContain('assigned to you for review');
	});

	it('names the state instead of the action once it is filed', () => {
		const body = renderPage('submitted', null, null, { reviewId: 5, status: 'submitted' });

		expect(body).toContain('href="/review/test-conf/1"');
		expect(body).toContain('Open your review');
		expect(body).not.toContain('Write your review');
	});

	/**
	 * The failure this replaces is a link that 404s: the reviewer surface wants a
	 * seat *and* a non-recused review row, so a page that guesses from the
	 * assignment matrix alone would offer a door into a wall.
	 */
	it('links nowhere when the organizer may not review, and says what would change that', () => {
		const body = renderPage('submitted');

		expect(body).toContain('data-testid="own-review"');
		expect(body).not.toContain('href="/review/test-conf/1"');
		expect(body).toContain('reviewer seat');
		expect(body).toContain('/manage/test-conf/people');
		// A round exists in this fixture, so the next step is the assignment.
		expect(body).toContain('assign yourself to a round');
	});

	it('names the round as the missing step when there is none', () => {
		const noRounds = renderPage('submitted', null, null, null, 'none');

		expect(noRounds).toContain('create a review round.');
		expect(noRounds).not.toContain('assign yourself to a round');
	});
});
