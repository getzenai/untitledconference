/**
 * Who may see whose review (#19, ABS-07).
 *
 * The product's default is a committee that argues with each other, because that is
 * what a programme committee does. `blind_until_reviewed` is the one restriction
 * worth having: it removes the anchoring effect — the first score posted becomes
 * everybody's prior — without removing the discussion that follows.
 *
 * The rules are here, with no database, because the same question is asked in three
 * places (the queue's aggregate, the detail's peer list, the reviewer's own form) and
 * the three must not answer it differently. **Whatever this returns false for must be
 * left out of the query, not hidden in the markup** — a blind mode enforced by CSS is
 * not blind, it is unlisted.
 */

export type ReviewVisibility = 'open' | 'blind_until_reviewed';

export const REVIEW_VISIBILITY_MODES: {
	value: ReviewVisibility;
	label: string;
	description: string;
}[] = [
	{
		value: 'open',
		label: 'Open',
		description:
			'Every reviewer sees all scores and comments at any time. Best for a committee that discusses.'
	},
	{
		value: 'blind_until_reviewed',
		label: 'Blind until reviewed',
		description:
			'A reviewer sees other people’s scores and comments only after submitting their own. Removes the anchoring effect.'
	}
];

/**
 * May this reviewer see the other reviews on this submission?
 *
 * `hasOwnSubmittedReview` means *submitted*, not *assigned* and not *drafted*: an
 * unfinished review is exactly the state the blind mode exists to protect.
 */
export function canSeePeerReviews(mode: ReviewVisibility, hasOwnSubmittedReview: boolean): boolean {
	return mode === 'open' || hasOwnSubmittedReview;
}

/**
 * The organizer always sees everything.
 *
 * They decide, so a decision made on a half-visible file would be worse than the
 * anchoring the mode is protecting against. The setting governs peers, not the chair.
 */
export function canOrganizerSeeAllReviews(): boolean {
	return true;
}

export type QueueSort = 'coverage' | 'score';

export const QUEUE_SORTS: { value: QueueSort; label: string; hint: string }[] = [
	{
		value: 'coverage',
		label: 'Fewest reviews first',
		hint: 'The working list — what still needs somebody.'
	},
	{
		value: 'score',
		label: 'Highest score first',
		hint: 'The decision agenda — what the committee should talk about.'
	}
];

export type QueueRow = {
	submissionId: number;
	title: string;
	reviewsSubmitted: number;
	/** Null when the viewer may not see the aggregate yet, or nobody has scored. */
	score: number | null;
	ownReviewSubmitted: boolean;
};

/**
 * Orders the queue.
 *
 * Two sorts, because a reviewer and a chair are looking for opposite things: the
 * reviewer wants what nobody has done, the chair wants what scored highest. Rows the
 * viewer may not see a score for sort last rather than as zero — hidden is not bad.
 */
export function sortQueue<T extends QueueRow>(rows: T[], sort: QueueSort): T[] {
	const byTitle = (a: T, b: T) => a.title.localeCompare(b.title);

	if (sort === 'score') {
		return [...rows].sort((a, b) => {
			if (a.score === null && b.score === null) return byTitle(a, b);
			if (a.score === null) return 1;
			if (b.score === null) return -1;
			return b.score - a.score || byTitle(a, b);
		});
	}

	return [...rows].sort((a, b) => a.reviewsSubmitted - b.reviewsSubmitted || byTitle(a, b));
}
