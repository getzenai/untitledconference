import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import type { DecisionResult } from '$lib/server/conference/decisions';
import { describe, expect, it } from 'vitest';
import {
	describeBulkAssign,
	describeDecision,
	describeNotification,
	notificationTone
} from './decision-summary';

const result = (over: Partial<DecisionResult> = {}): DecisionResult => ({
	decided: 0,
	unchanged: 0,
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
			'1 assignment created. 2 submissions could not be assigned to that reviewer.'
		);
	});

	it('names recusals bulk left alone so the organizer sees the override that did not happen', () => {
		expect(describeBulkAssign({ created: 40, already: 0, skipped: 0, recused: 3 })).toBe(
			'40 assignments created. 3 recused — left alone.'
		);
	});
});
