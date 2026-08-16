/**
 * Local assignment writes on a talk (#721).
 *
 * Assign and Unassign have an obvious next row: that reviewer is on the talk,
 * or they are not. The page used to reload to learn that. Queue the write,
 * paint it, settle against the reply. Dropping the write is the rollback —
 * the next derive is the server list again.
 */

import { unassignBlockReason, type ReviewAssignmentStatus } from './review-assignment';

export type AssignmentWrite = {
	kind: 'assign' | 'unassign';
	roundId: number;
	reviewerUserId: string;
};

export type OptimisticAssignmentReviewer = {
	userId: string;
	status: ReviewAssignmentStatus | null;
	unassignBlockReason: string | null;
};

export function assignmentWriteFromForm(form: FormData): AssignmentWrite | null {
	const roundId = Number(form.get('roundId'));
	const reviewerUserId = form.get('reviewerUserId');
	const intent = form.get('intent');
	if (
		!Number.isInteger(roundId) ||
		roundId <= 0 ||
		typeof reviewerUserId !== 'string' ||
		reviewerUserId === '' ||
		(intent !== 'assign' && intent !== 'unassign')
	) {
		return null;
	}
	return { kind: intent, roundId, reviewerUserId };
}

export function applyAssignmentWrites<
	R extends OptimisticAssignmentReviewer,
	Round extends { id: number; reviewers: R[] }
>(rounds: Round[], writes: readonly AssignmentWrite[]): Round[] {
	return writes.reduce((next, write) => applyOne(next, write), rounds);
}

function applyOne<
	R extends OptimisticAssignmentReviewer,
	Round extends { id: number; reviewers: R[] }
>(rounds: Round[], write: AssignmentWrite): Round[] {
	return rounds.map((round) => {
		if (round.id !== write.roundId) return round;
		return {
			...round,
			reviewers: round.reviewers.map((reviewer) => {
				if (reviewer.userId !== write.reviewerUserId) return reviewer;
				if (write.kind === 'assign') {
					return {
						...reviewer,
						status: 'assigned' as const,
						unassignBlockReason: unassignBlockReason('assigned')
					};
				}
				return { ...reviewer, status: null, unassignBlockReason: null };
			})
		};
	});
}
