/**
 * The numbers `list_my_review_assignments` must not leave to the model (#888).
 *
 * The reviewer screen already answers "how many can I file tonight" without
 * recounting: outstanding (not withdrawn) is the denominator, and a row waits
 * only when this reviewer has not filed and the speaking window is open. The
 * tool used to return the full list plus a single `count`, so the assistant
 * had to filter — and one night named a 4/4 talk as still waiting.
 */
import type { RoundWindowState } from '$lib/conference/round-window';

export type ReviewAssignmentRow = {
	ownReviewSubmitted: boolean;
	withdrawn: boolean;
	window: RoundWindowState | { state: RoundWindowState };
};

function windowState(row: ReviewAssignmentRow): RoundWindowState {
	return typeof row.window === 'string' ? row.window : row.window.state;
}

/** Same predicate as the reviewer queue's "you can review now". */
export function reviewAssignmentIsOpen(row: ReviewAssignmentRow): boolean {
	return !row.withdrawn && !row.ownReviewSubmitted && windowState(row) === 'open';
}

export function summarizeReviewAssignments<T extends ReviewAssignmentRow>(assignments: T[]) {
	const marked = assignments.map((row) => ({ ...row, open: reviewAssignmentIsOpen(row) }));
	const total = marked.filter((row) => !row.withdrawn).length;
	const open = marked.filter((row) => row.open).length;
	return { open, total, count: total, assignments: marked };
}
