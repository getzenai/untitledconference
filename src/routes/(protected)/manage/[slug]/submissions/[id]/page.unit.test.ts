/** A single decision is saved before, and independently from, its notification. */
import { DRAFT_DECISION_REASON, WITHDRAWN_DECISION_REASON } from '$lib/conference/decision-summary';
import { unassignBlockReason } from '$lib/conference/review-assignment';
import type { SpeakerHistory } from '$lib/conference/speaker-history';
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
	slotCapacity: null,
	predecessorConferenceId: null,
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
	acceptCondition?: string | null;
	acceptConditionOwner?: string | null;
	acceptConditionOwnerId?: string | null;
	resubmitGuidance?: string | null;
	declineNote?: string | null;
	editorialStand?:
		| 'materials_requested'
		| 'received'
		| 'reviewed'
		| 'revision_requested'
		| 'final'
		| null;
	organizers?: { userId: string; name: string }[];
	/** #451: what these speakers held at our earlier editions. */
	speakerHistory?: SpeakerHistory[];
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
	status:
		| 'accepted'
		| 'submitted'
		| 'rejected'
		| 'draft'
		| 'waitlisted'
		| 'resubmit_with_guidance'
		| 'withdrawn',
	notificationStatus: null | 'queued' | 'sent' | 'failed' = null,
	reviewerStatus: null | 'assigned' | 'submitted' = null,
	ownReview: null | { reviewId: number; status: 'assigned' | 'submitted' } = null,
	rounds: 'one' | 'none' | 'two' = 'one',
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
					submittedAt: status === 'draft' ? null : new Date('2027-01-02T00:00:00Z'),
					decidedAt: status === 'accepted' ? new Date('2027-01-03T00:00:00Z') : null,
					track: null,
					sessionFormat: null,
					sessionMinutes: null,
					sponsorTier: extras.sponsorTier ?? null,
					sponsorNote: extras.sponsorNote ?? null,
					acceptCondition: extras.acceptCondition ?? null,
					acceptConditionOwner: extras.acceptConditionOwner ?? null,
					acceptConditionOwnerId: extras.acceptConditionOwnerId ?? null,
					resubmitGuidance: extras.resubmitGuidance ?? null,
					declineNote: extras.declineNote ?? null,
					editorialStand: extras.editorialStand ?? null,
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
											eligible: true,
											unassignBlockReason: unassignBlockReason(reviewerStatus)
										}
									]
								},
								...(rounds === 'two'
									? [
											{
												id: 20,
												name: 'Committee pass',
												reviewers: [
													{
														userId: 'reviewer-2',
														name: 'Casey Committee',
														email: 'casey@example.com',
														status: reviewerStatus,
														eligible: true,
														unassignBlockReason: unassignBlockReason(reviewerStatus)
													}
												]
											}
										]
									: [])
							],
				ownReview,
				contentEdit: extras.contentEdit ?? null,
				sponsorTiers: extras.sponsorTiers ?? [],
				organizers: extras.organizers ?? [{ userId: 'organizer-1', name: 'Jordan' }],
				speakerHistory: extras.speakerHistory ?? []
			} as PageData,
			form: (extras.form ?? (notificationResult ? { notificationResult } : null)) as ActionData
		}
	}).body;
}

describe('organizer submission detail decision workflow', () => {
	it('greys Accept, Waitlist and Decline on a draft and says why (#471)', () => {
		const body = renderPage('draft');
		const decide = body.slice(
			body.indexOf('action="?/decide"'),
			body.indexOf('</form>', body.indexOf('action="?/decide"'))
		);

		expect(decide).toContain('value="rejected"');
		expect(decide).toContain('value="waitlisted"');
		expect(decide).toContain('value="accepted"');
		expect(decide.match(/disabled=""/g)?.length).toBe(4);
		expect(body).toContain('data-testid="decision-block-reason"');
		expect(body).toContain(DRAFT_DECISION_REASON);
		expect(body).not.toContain('text-status-good');
	});

	it('hides Accept, Decline and Assign on a withdrawn talk and says why (#716)', () => {
		const body = renderPage('withdrawn');
		const decide = body.slice(
			body.indexOf('action="?/decide"'),
			body.indexOf('</form>', body.indexOf('action="?/decide"'))
		);

		expect(decide).not.toContain('value="rejected"');
		expect(decide).not.toContain('value="accepted"');
		expect(body).not.toContain('value="assign"');
		expect(body).toContain('data-testid="decision-block-reason"');
		expect(body).toContain(WITHDRAWN_DECISION_REASON);
	});

	it('leaves the three buttons live once the speaker has handed the talk in', () => {
		const body = renderPage('submitted');
		const decide = body.slice(
			body.indexOf('action="?/decide"'),
			body.indexOf('</form>', body.indexOf('action="?/decide"'))
		);

		expect(decide).not.toContain('disabled=""');
		expect(body).not.toContain('data-testid="decision-block-reason"');
	});

	it('renders separate decide and notify forms and names the boundary', () => {
		const body = renderPage('accepted');

		expect(body).toContain('action="?/decide"');
		expect(body).toContain('action="?/notify"');
		expect(body).toContain(
			'Saving Accept, Waitlist, Decline or Ask to resubmit does not notify speakers'
		);
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

	it('keeps Unassign visible and names why a submitted review cannot be dropped', () => {
		const body = renderPage('submitted', null, 'submitted');
		const reason = unassignBlockReason('submitted');

		expect(body).toContain('value="unassign"');
		expect(body).toContain('data-testid="unassign-block-reason"');
		expect(reason).toBeTruthy();
		expect(body).toContain(reason);
		const unassign = body.slice(
			body.lastIndexOf('<button', body.indexOf('value="unassign"')),
			body.indexOf('</button>', body.indexOf('value="unassign"'))
		);
		expect(unassign).toContain('Unassign');
		expect(unassign).not.toContain('·');
		expect(unassign).toContain('disabled');
		const row = body.slice(body.indexOf('Riley Reviewer'), body.indexOf('value="unassign"'));
		expect(row).toContain('data-status="submitted"');
	});

	it('offers a live Unassign when the server has no block reason', () => {
		const body = renderPage('submitted', null, 'assigned');

		expect(body).toContain('value="unassign"');
		expect(body).not.toContain('Unassign ·');
		const unassign = body.slice(
			body.lastIndexOf('<button', body.indexOf('value="unassign"')),
			body.indexOf('</button>', body.indexOf('value="unassign"'))
		);
		expect(unassign).toContain('Unassign');
		expect(unassign).not.toContain('·');
		const row = body.slice(body.indexOf('Riley Reviewer'), body.indexOf('value="unassign"'));
		expect(row).toContain('data-status="assigned"');
		expect(body).not.toContain('data-testid="unassign-block-reason"');
	});
});

/**
 * Two rounds with similar reviewer lists used to read as one list (#417).
 *
 * Each round is a bounded container, and the test slices those containers —
 * presence of both names on the page would still pass if they sat in one
 * undivided stack.
 */
describe('review-round grouping on the assignment block (#417)', () => {
	it('gives each round its own container so two lists cannot be read as one', () => {
		const body = renderPage('submitted', null, null, null, 'two');
		const assignments = body.slice(body.indexOf('data-testid="review-assignments"'));

		const first = assignments.indexOf('data-testid="assignment-round"');
		const second = assignments.indexOf('data-testid="assignment-round"', first + 1);
		const third = assignments.indexOf('data-testid="assignment-round"', second + 1);

		expect(first).toBeGreaterThan(-1);
		expect(second).toBeGreaterThan(first);
		expect(third).toBe(-1);

		const firstRound = assignments.slice(first, second);
		const secondRound = assignments.slice(second);

		expect(firstRound).toContain('Round 1');
		expect(firstRound).toContain('Riley Reviewer');
		expect(firstRound).not.toContain('Casey Committee');

		expect(secondRound).toContain('Committee pass');
		expect(secondRound).toContain('Casey Committee');
		expect(secondRound).not.toContain('Riley Reviewer');
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

	it('takes a condition and an owner on an undecided talk (#445)', () => {
		const body = renderPage('submitted', null, null, null, 'one', null, {
			organizers: [{ userId: 'ann', name: 'Ann Follows' }]
		});

		expect(body).toContain('data-testid="accept-condition"');
		expect(body).toContain('name="condition"');
		expect(body).toContain('name="conditionOwnerId"');
		expect(body).toContain('data-testid="accept-condition-owner"');
		expect(body).not.toContain('data-testid="submission-condition"');
		expect(body).not.toContain('data-testid="resolve-condition"');
	});

	it('names an open condition without opening anything, and offers resolve', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			acceptCondition: 'bring a co-presenter',
			acceptConditionOwner: 'Ann Follows',
			acceptConditionOwnerId: 'ann'
		});

		expect(body).toContain('data-testid="submission-condition"');
		expect(body).toContain('bring a co-presenter · Ann Follows');
		expect(body).toContain('data-testid="resolve-condition"');
		expect(body).not.toContain('data-testid="accept-condition"');
	});

	it('lets an accepted talk carry a named stand and advance it (#446)', () => {
		const unset = renderPage('accepted');
		expect(unset).toContain('data-testid="editorial-stand"');
		expect(unset).toContain('data-testid="set-editorial-stand"');
		expect(unset).toContain('data-testid="advance-editorial-stand"');
		expect(unset).toContain('Advance to materials requested');
		expect(unset).not.toContain('data-testid="submission-editorial-stand"');

		const named = renderPage('accepted', null, null, null, 'one', null, {
			editorialStand: 'received'
		});
		expect(named).toContain('data-testid="submission-editorial-stand"');
		expect(named).toContain('Advance to reviewed');

		const done = renderPage('accepted', null, null, null, 'one', null, {
			editorialStand: 'final'
		});
		expect(done).toContain('data-testid="submission-editorial-stand"');
		expect(done).not.toContain('data-testid="advance-editorial-stand"');
	});

	it('does not offer a stand on a talk that is not accepted', () => {
		const body = renderPage('submitted');
		expect(body).not.toContain('data-testid="editorial-stand"');
		expect(body).not.toContain('data-testid="advance-editorial-stand"');
	});

	it('lets the organizer rewrite the sentence and the owner (#540)', () => {
		const body = renderPage('accepted', null, null, null, 'one', null, {
			acceptCondition: 'bring a co-presenter',
			acceptConditionOwner: 'Ann Follows',
			acceptConditionOwnerId: 'ann',
			organizers: [
				{ userId: 'ann', name: 'Ann Follows' },
				{ userId: 'bob', name: 'Bob Chases' }
			]
		});

		expect(body).toContain('data-testid="edit-condition"');
		expect(body).toContain('data-testid="edit-condition-text"');
		expect(body).toContain('data-testid="edit-condition-owner"');
		expect(body).toContain('data-testid="save-condition"');
		expect(body).toContain('bring a co-presenter');
		expect(body).toContain('name="conditionOwnerId"');
		expect(body).toContain('value="ann"');
	});

	it('offers resubmit with guidance as its own way out (#447)', () => {
		const open = renderPage('submitted');
		expect(open).toContain('data-testid="decide-resubmit"');
		expect(open).toContain('data-testid="resubmit-guidance-text"');
		expect(open).toContain('data-testid="decline-note-text"');
		expect(open).toContain('value="resubmit_with_guidance"');

		const asked = renderPage('resubmit_with_guidance', null, null, null, 'one', null, {
			resubmitGuidance: 'resubmit with your client'
		});
		expect(asked).toContain('data-testid="submission-guidance"');
		expect(asked).toContain('resubmit with your client');
		expect(asked).not.toContain('data-testid="resubmit-guidance-text"');
	});

	it('keeps a decline note when one was written (#447)', () => {
		const body = renderPage('rejected', null, null, null, 'one', null, {
			declineNote: 'closest we had — try again with the case study'
		});
		expect(body).toContain('data-testid="submission-decline-note"');
		expect(body).toContain('closest we had — try again with the case study');
		expect(body).not.toContain('data-testid="decline-note-text"');
	});
});

/**
 * #451 on the organizer's detail page — the panel the decision meeting reads
 * from. The wording itself is covered by the summary's own unit test; what this
 * asserts is that the panel appears next to the talk, and that a talk with no
 * history leaves no empty frame behind.
 */
describe('speaker history panel', () => {
	it('shows the count, the latest year and the past talks', () => {
		const body = renderPage('submitted', null, null, null, 'one', null, {
			speakerHistory: [
				{
					speakerProfileId: 3,
					name: 'Ada Lovelace',
					appearances: [
						{ conferenceId: 2, conferenceName: 'Untitled 2025', year: 2025, talkTitle: 'Note G' },
						{ conferenceId: 1, conferenceName: 'Untitled 2024', year: 2024, talkTitle: 'Engines' }
					]
				}
			]
		});

		expect(body).toContain('data-testid="submission-speaker-history"');
		expect(body).toContain('Spoke here twice, most recently 2025');
		expect(body).toContain('Note G');
	});

	it('names a first-timer rather than hiding them', () => {
		// The panel exists as soon as the talk has a speaker, because "we have never
		// had them" is an answer the meeting wants and silence is not.
		const body = renderPage('submitted', null, null, null, 'one', null, {
			speakerHistory: [{ speakerProfileId: 4, name: 'Grace Hopper', appearances: [] }]
		});

		expect(body).toContain('First time with us');
	});

	it('renders nothing when there is no speaker on the talk', () => {
		const body = renderPage('submitted');

		expect(body).not.toContain('data-testid="submission-speaker-history"');
	});
});
