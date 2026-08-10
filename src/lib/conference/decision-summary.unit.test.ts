import type { NotificationResult } from '$lib/server/conference/decision-notifications';
import type { DecisionResult } from '$lib/server/conference/decisions';
import { describe, expect, it } from 'vitest';
import { describeDecision, describeNotification } from './decision-summary';

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
	...over
});

describe('describeNotification', () => {
	it('separates queued, duplicate, undecided and address-less rows', () => {
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
			'2 submissions notified; 3 emails queued. 1 submission already notified, left untouched. 1 submission has no decision yet, skipped. 1 submission has no speaker email, skipped.'
		);
	});
});
