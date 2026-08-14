/**
 * The one place that names why Assign, Auto-distribute or Notify is grey (#453).
 *
 * First failing gate only, in fill order. Notify is selection — not "nothing
 * decided". Assign still needs a reviewer after the round is picked;
 * Auto-distribute does not.
 */
import { describe, expect, it } from 'vitest';
import {
	BULK_COUNTS_REASON,
	BULK_REVIEWER_REASON,
	BULK_ROUND_REASON,
	BULK_SELECT_REASON,
	bulkToolbarBlockReason,
	type BulkToolbarFacts
} from './bulk-toolbar';

const ready: BulkToolbarFacts = {
	selectedCount: 2,
	hasRound: true,
	reviewerCount: 1,
	reviewsPerSubmission: 2,
	capPerReviewer: 10
};

describe('bulkToolbarBlockReason', () => {
	it('names a missing selection on every control — that is the first-paint lock', () => {
		const empty = { ...ready, selectedCount: 0, hasRound: false, reviewerCount: 0 };
		expect(bulkToolbarBlockReason('notify', empty)).toBe(BULK_SELECT_REASON);
		expect(bulkToolbarBlockReason('assign', empty)).toBe(BULK_SELECT_REASON);
		expect(bulkToolbarBlockReason('distribute', empty)).toBe(BULK_SELECT_REASON);
	});

	it('does not invent "nothing decided" for Notify — the template never checked that', () => {
		const reason = bulkToolbarBlockReason('notify', { ...ready, selectedCount: 3 });
		expect(reason).toBeNull();
		expect(bulkToolbarBlockReason('notify', { ...ready, selectedCount: 0 })).not.toMatch(/decid/i);
	});

	it('then names the missing round on Assign and Auto-distribute', () => {
		const noRound = { ...ready, hasRound: false, reviewerCount: 0 };
		expect(bulkToolbarBlockReason('assign', noRound)).toBe(BULK_ROUND_REASON);
		expect(bulkToolbarBlockReason('distribute', noRound)).toBe(BULK_ROUND_REASON);
		expect(bulkToolbarBlockReason('notify', noRound)).toBeNull();
	});

	it('then names the missing reviewer on Assign only — Auto-distribute fills the committee', () => {
		const noReviewer = { ...ready, reviewerCount: 0 };
		expect(bulkToolbarBlockReason('assign', noReviewer)).toBe(BULK_REVIEWER_REASON);
		expect(bulkToolbarBlockReason('distribute', noReviewer)).toBeNull();
	});

	it('names broken per-talk / cap numbers on Auto-distribute only', () => {
		expect(bulkToolbarBlockReason('distribute', { ...ready, reviewsPerSubmission: 0 })).toBe(
			BULK_COUNTS_REASON
		);
		expect(bulkToolbarBlockReason('distribute', { ...ready, capPerReviewer: 1.5 })).toBe(
			BULK_COUNTS_REASON
		);
		expect(bulkToolbarBlockReason('assign', { ...ready, reviewsPerSubmission: 0 })).toBeNull();
	});

	it('is silent when the control can run', () => {
		expect(bulkToolbarBlockReason('notify', ready)).toBeNull();
		expect(bulkToolbarBlockReason('assign', ready)).toBeNull();
		expect(bulkToolbarBlockReason('distribute', ready)).toBeNull();
	});
});
