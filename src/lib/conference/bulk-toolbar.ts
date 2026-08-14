/**
 * Why a submissions-toolbar control is dead (#453).
 *
 * Assign, Auto-distribute and Notify look the same when grey, but they are
 * not the same gate. Notify wants a selection. Auto-distribute wants a
 * selection and a round. Assign wants those plus a checked reviewer. The
 * sentence above the bar only covers Decide. **Whatever this returns a
 * reason for is refused on the server** — a disabled button is not a lock.
 *
 * The first failing gate wins, in the order the form is filled: rows, then
 * round, then reviewers / counts. Do not invent a fourth reason (nothing
 * decided, the round is closed). If it is not in the current `disabled={…}`,
 * it is not here.
 */

export type BulkToolbarControl = 'notify' | 'assign' | 'distribute';

export type BulkToolbarFacts = {
	selectedCount: number;
	hasRound?: boolean;
	reviewerCount?: number;
	reviewsPerSubmission?: number;
	capPerReviewer?: number;
};

export const BULK_SELECT_REASON = 'Select at least one submission first.';
export const BULK_ROUND_REASON = 'Choose a review round.';
export const BULK_REVIEWER_REASON = 'Choose at least one reviewer.';
export const BULK_COUNTS_REASON =
	'Set how many reviewers each talk needs, and the cap per reviewer.';

function isPositiveInt(n: number | undefined): n is number {
	return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

/** `null` when the control may be used. */
export function bulkToolbarBlockReason(
	control: BulkToolbarControl,
	facts: BulkToolbarFacts
): string | null {
	if (facts.selectedCount < 1) return BULK_SELECT_REASON;
	if (control === 'notify') return null;

	if (!facts.hasRound) return BULK_ROUND_REASON;
	if (control === 'assign' && (facts.reviewerCount ?? 0) < 1) return BULK_REVIEWER_REASON;
	if (
		control === 'distribute' &&
		!(isPositiveInt(facts.reviewsPerSubmission) && isPositiveInt(facts.capPerReviewer))
	)
		return BULK_COUNTS_REASON;
	return null;
}
