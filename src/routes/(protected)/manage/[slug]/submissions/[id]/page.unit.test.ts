/** A single decision is saved before, and independently from, its notification. */
import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { ActionData, PageData } from './$types';
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
	statusBeforeArchive: null,
	listedPublicly: false,
	reviewVisibility: 'open',
	createdAt: new Date('2027-01-01T00:00:00Z'),
	updatedAt: new Date('2027-01-01T00:00:00Z')
};

/** Anything the content-editor tests need to vary, kept out of the positional list. */
type Extras = {
	placements?: { id: number; status: string; recordingUrl: string | null }[];
	contentEdit?: { editedAt: Date; editorName: string | null } | null;
	form?: ActionData;
	keyTakeaway?: string | null;
	audienceLevel?: string | null;
	sponsorTier?: string | null;
	sponsorNote?: string | null;
	sponsorTiers?: { id: number; name: string; note: string | null; position: number }[];
	speakers?: {
		id: number;
		name: string;
		jobTitle: string | null;
		company: string | null;
		headshotUrl: string | null;
		isPrimary: boolean;
		roleLabel: string | null;
	}[];
};

function renderPage(
	status: 'accepted' | 'submitted' | 'rejected',
	notificationStatus: null | 'queued' | 'sent' | 'failed' = null,
	reviewerStatus: null | 'assigned' | 'submitted' = null,
	ownReview: null | { reviewId: number; status: 'assigned' | 'submitted' } = null,
	rounds: 'one' | 'none' = 'one',
	notificationResult: NotificationResult | null = null,
	extras: Extras = {}
) {
	return render(Page, {
		props: {
			data: {
				user: { id: 'organizer-1', name: 'Jordan' },
				speakerProfile: false,
				impersonating: null,
				analytics: { apiKey: undefined, host: undefined },
				conference,
				submission: {
					id: 1,
					title: 'A deliberate decision',
					abstract: 'An abstract.',
					keyTakeaway: extras.keyTakeaway ?? null,
					audienceLevel: extras.audienceLevel ?? null,
					status,
					contentApproval: 'pending',
					submittedAt: new Date('2027-01-02T00:00:00Z'),
					decidedAt: status === 'accepted' ? new Date('2027-01-03T00:00:00Z') : null,
					track: null,
					sessionFormat: null,
					sessionMinutes: null,
					sponsorTier: extras.sponsorTier ?? null,
					sponsorNote: extras.sponsorNote ?? null,
					speakers: extras.speakers ?? [],
					answers: [],
					reviews: [],
					score: null,
					placements: extras.placements ?? []
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
				ownReview,
				contentEdit: extras.contentEdit ?? null,
				sponsorTiers: extras.sponsorTiers ?? []
			} as PageData,
			form: (extras.form ?? (notificationResult ? { notificationResult } : null)) as ActionData
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

/**
 * ABS-11: co-author role on the organizer detail.
 *
 * The CFP stores roleLabel; the list only shows "Priya +1". The detail is where
 * the role must appear — and it must not hide behind job title / company.
 */
describe('co-author roles on the detail (ABS-11)', () => {
	it('shows the stored role even when job title and company are set', () => {
		const body = renderPage('submitted', null, null, null, 'one', null, {
			speakers: [
				{
					id: 1,
					name: 'Priya Raman',
					jobTitle: 'Staff Engineer',
					company: 'Acme',
					headshotUrl: null,
					isPrimary: true,
					roleLabel: null
				},
				{
					id: 2,
					name: 'Zoe Adler',
					jobTitle: 'Principal',
					company: 'Beta Co',
					headshotUrl: null,
					isPrimary: false,
					roleLabel: 'Co-presenter'
				}
			]
		});

		expect(body).toContain('data-testid="submission-speakers"');
		expect(body).toContain('Zoe Adler');
		expect(body).toContain('data-testid="speaker-role"');
		expect(body).toContain('Co-presenter');
		// Job title must not replace the role — both should be on the page.
		expect(body).toContain('Principal');
		expect(body).toContain('Beta Co');
		// Primary without a custom label still gets a readable role.
		expect(body).toContain('Primary speaker');
	});

	it('points from the reviews block to the scorecard editor', () => {
		const body = renderPage('submitted');

		expect(body).toContain('data-testid="edit-scorecard-link"');
		expect(body).toContain('href="/manage/test-conf/rounds"');
		expect(body).toContain('Scorecard &amp; weights');
	});
});

/**
 * The organizer's own edit of the talk's text.
 *
 * The screen owes three things beyond the form: it must not open by default (the
 * common visit is reading, not rewriting), it must keep a refused edit on screen
 * instead of restoring the stored text underneath the error, and it must say when
 * someone other than the speaker last changed these words.
 */
describe('the organizer talk editor', () => {
	it('reads as prose until the organizer asks to edit', () => {
		const body = renderPage('accepted');

		expect(body).toContain('An abstract.');
		expect(body).toContain('Edit talk');
		expect(body).not.toContain('action="?/content"');
	});

	it('posts the four content fields under the names the action reads', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			form: {
				contentErrors: { title: 'A title is required.' },
				contentValues: {
					title: '',
					abstract: 'An abstract.',
					keyTakeaway: null,
					audienceLevel: null
				}
			}
		});

		expect(body).toContain('action="?/content"');
		expect(body).toContain('name="title"');
		expect(body).toContain('name="abstract"');
		expect(body).toContain('name="keyTakeaway"');
		expect(body).toContain('name="audienceLevel"');
		expect(body).toContain('A title is required.');
		// The panel stays open on a refusal, or the error names a field nobody can see.
		expect(body).not.toContain('>Edit talk<');
	});

	it('shows the rejected text back, not the stored text', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			form: {
				contentErrors: { abstract: 'A submitted talk needs an abstract.' },
				contentValues: {
					title: 'A rewritten title',
					abstract: '',
					keyTakeaway: 'Kept',
					audienceLevel: null
				}
			}
		});

		expect(body).toContain('value="A rewritten title"');
		expect(body).toContain('value="Kept"');
		expect(body).toContain('A submitted talk needs an abstract.');
		// The heading still carries the saved title — the field must not.
		expect(body).not.toContain('value="A deliberate decision"');
		expect(body).toContain('<textarea');
	});

	it('names who last rewrote the speaker’s words', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			contentEdit: { editedAt: new Date('2027-02-01T00:00:00Z'), editorName: 'Jordan' }
		});

		expect(body).toContain('data-testid="content-edit-trail"');
		expect(body).toContain('Jordan');
		expect(body).toContain('1 Feb 2027');
	});

	it('falls back to the role when the editing account is gone', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			contentEdit: { editedAt: new Date('2027-02-01T00:00:00Z'), editorName: null }
		});

		expect(body).toContain('an organizer');
	});

	it('offers a sponsor-tier select as an organizer action (#434)', () => {
		const body = renderPage('submitted', null, null, null, 'one', null, {
			sponsorTiers: [
				{ id: 7, name: 'Gold', note: 'paid keynote', position: 0 },
				{ id: 8, name: 'Silver', note: null, position: 1 }
			]
		});

		expect(body).toContain('data-testid="submission-sponsor"');
		expect(body).toContain('action="?/sponsor"');
		expect(body).toContain('name="sponsorTierId"');
		expect(body).toContain('No sponsor');
		expect(body).toContain('internal only');
		expect(body).toContain('Reviewers do not see this');
		expect(body).not.toContain('Add them in Settings');
	});

	it('starts the select at the stored tier and shows its note', () => {
		const body = renderPage('submitted', null, null, null, 'one', null, {
			sponsorTier: 'Gold',
			sponsorNote: 'paid keynote',
			sponsorTiers: [{ id: 7, name: 'Gold', note: 'paid keynote', position: 0 }]
		});

		expect(body).toContain('value="7"');
		expect(body).toContain('Gold');
		expect(body).toContain('paid keynote');
		expect(body).not.toContain('value="none"');
	});

	it('points at Settings when there is nothing to assign yet', () => {
		const body = renderPage('submitted');

		expect(body).toContain('data-testid="submission-sponsor"');
		expect(body).toContain('href="/manage/test-conf/settings#sponsors"');
		expect(body).not.toContain('action="?/sponsor"');
	});

	it('warns when a declined talk still has a placement (#9)', () => {
		const body = renderPage('rejected', null, null, null, 'none', null, {
			placements: [{ id: 7, status: 'confirmed', recordingUrl: null }]
		});

		expect(body).toContain('data-testid="rejected-placement-badge"');
		expect(body).toContain('Declined but still on the programme');
		expect(body).toContain('/manage/test-conf/agenda');
	});
});
