/**
 * The one place that decides whether an organizer may drop an assignment (#454).
 *
 * Submitted is the only lock — the round being open, the reviewer's index, and
 * a recusal do not hide Unassign. The write path and the row both ask this.
 */
import { describe, expect, it } from 'vitest';
import { SUBMITTED_REVIEW_UNASSIGN_REASON, unassignBlockReason } from './review-assignment';

describe('unassignBlockReason', () => {
	it('names why a submitted review cannot be dropped', () => {
		expect(unassignBlockReason('submitted')).toBe(SUBMITTED_REVIEW_UNASSIGN_REASON);
		expect(unassignBlockReason('submitted')).toMatch(/discard/i);
	});

	it('lets an assigned seat be dropped', () => {
		expect(unassignBlockReason('assigned')).toBeNull();
	});

	it('does not speak for recused or empty seats — those are not unassign targets', () => {
		expect(unassignBlockReason('recused')).toBeNull();
		expect(unassignBlockReason(null)).toBeNull();
		expect(unassignBlockReason(undefined)).toBeNull();
	});
});
