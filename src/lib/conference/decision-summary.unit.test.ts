import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import type { DecisionResult } from '$lib/server/conference/decisions';
import { describe, expect, it } from 'vitest';
import {
	DRAFT_DECISION_REASON,
	decisionBlockReason,
	describeBulkAssign,
	describeDecision,
	describeNotification,
	notificationTone
} from './decision-summary';

const result = (over: Partial<DecisionResult> = {}): DecisionResult => ({
	decided: 0,
	unchanged: 0,
	skippedDrafts: 0,
	sessionsCreated: 0,
	tasksCreated: 0,
	sessionsRemoved: 0,
	tasksRemoved: 0,
	...over
});

describe('describeDecision', () => {
	it('names every consequence that happened', () => {
		expect(
			describeDecision('accepted', result({ decided: 2, sessionsCreated: 2, tasksCreated: 8 }))
		).toBe('2 submissions accepted. 2 sessions added to the agenda tray. 8 speaker tasks created.');
	});

	it('says what was undone when an acceptance is taken back', () => {
		expect(
			describeDecision('rejected', result({ decided: 1, sessionsRemoved: 1, tasksRemoved: 4 }))
		).toBe(
			'1 submission declined. 1 session taken out of the agenda tray. 4 open speaker tasks withdrawn.'
		);
	});

	it('does not stay silent when the click changed nothing', () => {
		// Silence after a click reads as a failure. It was a no-op, and it says so.
		expect(describeDecision('accepted', result({ unchanged: 1 }))).toBe(
			'Already accepted — nothing to do.'
		);
	});

	it('separates the rows it changed from the ones it skipped', () => {
		expect(describeDecision('accepted', result({ decided: 2, unchanged: 3 }))).toBe(
			'2 submissions accepted. 3 already accepted, left untouched.'
		);
	});

	it('names drafts it left rather than letting the count go quietly short', () => {
		expect(describeDecision('accepted', result({ decided: 1, skippedDrafts: 2 }))).toBe(
			'1 submission accepted. 2 drafts not submitted yet, left for the speaker.'
		);
	});
});

describe('decisionBlockReason', () => {
	it('names the draft so the three buttons can go grey instead of succeeding at nothing', () => {
		expect(decisionBlockReason('draft')).toBe(DRAFT_DECISION_REASON);
		expect(DRAFT_DECISION_REASON).toMatch(/not been submitted yet/i);
	});

	it('is silent once the speaker has handed the talk in', () => {
		for (const status of [
			'submitted',
			'in_review',
			'accepted',
			'rejected',
			'waitlisted',
			'resubmit_with_guidance'
		]) {
			expect(decisionBlockReason(status)).toBeNull();
		}
	});
});

const notification = (over: Partial<NotificationResult> = {}): NotificationResult => ({
	notified: 0,
	alreadyNotified: 0,
	notDecided: 0,
	withoutEmail: 0,
	emailsQueued: 0,
	dispatch: null,
	...over
});

describe('describeNotification', () => {
	it('separates queued, duplicate, undecided and address-less rows without claiming delivery', () => {
		expect(
			describeNotification(
				notification({
					notified: 2,
					emailsQueued: 3,
					alreadyNotified: 1,
					notDecided: 1,
					withoutEmail: 1
				})
			)
		).toBe(
			'3 emails queued for 2 submissions. 1 submission already had an active notification, left untouched. 1 submission has no decision yet, skipped. 1 submission has no speaker email, skipped.'
		);
	});

	it('reports provider outcomes instead of presenting queueing as delivery', () => {
		expect(
			describeNotification(
				notification({
					notified: 2,
					emailsQueued: 3,
					dispatch: { sent: 2, failed: 1, remaining: 0, disabled: false }
				})
			)
		).toBe(
			'3 emails queued for 2 submissions. 2 emails sent now. 1 email failed to send; use Notify again to retry.'
		);
	});

	it('says when queued mail cannot be dispatched', () => {
		expect(
			describeNotification(
				notification({
					notified: 1,
					emailsQueued: 1,
					dispatch: { sent: 0, failed: 0, remaining: 0, disabled: true }
				})
			)
		).toBe(
			'1 email queued for 1 submission. Delivery is not configured; the emails remain queued.'
		);
	});

	it('uses failure, queue and delivery tones that match the dispatch result', () => {
		expect(
			notificationTone(
				notification({
					notified: 1,
					emailsQueued: 1,
					dispatch: { sent: 0, failed: 1, remaining: 0, disabled: false }
				})
			)
		).toBe('bad');
		expect(
			notificationTone(
				notification({
					notified: 1,
					emailsQueued: 1,
					dispatch: { sent: 0, failed: 0, remaining: 0, disabled: true }
				})
			)
		).toBe('warn');
		expect(
			notificationTone(
				notification({
					notified: 1,
					emailsQueued: 1,
					dispatch: { sent: 1, failed: 0, remaining: 0, disabled: false }
				})
			)
		).toBe('good');
	});
});

describe('describeBulkAssign', () => {
	it('names created and already-assigned rows the way the DoD reads them', () => {
		expect(describeBulkAssign({ created: 3, already: 2, skipped: 0 })).toBe(
			'3 assignments created. 2 already assigned, left untouched.'
		);
	});

	it('stays honest when everything was already assigned', () => {
		expect(describeBulkAssign({ created: 0, already: 4, skipped: 0 })).toBe(
			'4 already assigned, left untouched.'
		);
	});

	it('counts ineligible pairs without claiming they landed', () => {
		expect(describeBulkAssign({ created: 1, already: 0, skipped: 2 })).toBe(
			'1 assignment created. 2 assignments skipped.'
		);
	});

	it('names skip reasons so the organizer knows which handle to pull', () => {
		expect(
			describeBulkAssign({
				created: 0,
				already: 0,
				skipped: 3,
				skippedItems: [
					{ reason: 'pool_exhausted' },
					{ reason: 'pool_exhausted' },
					{ reason: 'track_restricted' }
				]
			})
		).toBe('3 assignments skipped: 2 over the cap, 1 track-restricted.');
	});

	it('names an empty committee separately from the cap', () => {
		expect(
			describeBulkAssign({
				created: 0,
				already: 0,
				skipped: 2,
				skippedItems: [{ reason: 'empty_committee' }, { reason: 'empty_committee' }]
			})
		).toBe('2 assignments skipped: 2 with no reviewer in this round.');
	});

	it('sends a committee too small somewhere other than the cap', () => {
		// The two live in one message often enough — one seat had nobody left to
		// ask, the other had people and no room. Two different things to go and do,
		// so they must not read as one (#384).
		expect(
			describeBulkAssign({
				created: 0,
				already: 0,
				skipped: 3,
				skippedItems: [
					{ reason: 'committee_too_small' },
					{ reason: 'committee_too_small' },
					{ reason: 'pool_exhausted' }
				]
			})
		).toBe('3 assignments skipped: 2 with no one left to ask, 1 over the cap.');
	});

	it('names recusals bulk left alone so the organizer sees the override that did not happen', () => {
		expect(describeBulkAssign({ created: 40, already: 0, skipped: 0, recused: 3 })).toBe(
			'40 assignments created. 3 recused seats left alone — flip each on the submission if you mean to override.'
		);
	});
});
