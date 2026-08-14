/**
 * Whether an organizer may drop a reviewer assignment (#454).
 *
 * The assignment row *is* the review. Deleting a submitted one would throw the
 * filed scores away, so the write path refuses and the submission-detail row
 * says so. The condition lives here, with no database and no Svelte, because
 * the matrix, the delete, and the markup must not each decide "submitted"
 * their own way. **Whatever this returns a reason for is refused on the
 * server** — a hidden Unassign button is not a lock.
 *
 * Recused and unassigned seats are not unassign-targets: those rows offer
 * Reassign / Assign instead.
 */

export type ReviewAssignmentStatus = 'assigned' | 'submitted' | 'recused';

export const SUBMITTED_REVIEW_UNASSIGN_REASON =
	'This review is submitted — unassigning would discard it.';

/** `null` when the row may be dropped, or is not an unassign target. */
export function unassignBlockReason(
	status: ReviewAssignmentStatus | null | undefined
): string | null {
	return status === 'submitted' ? SUBMITTED_REVIEW_UNASSIGN_REASON : null;
}
