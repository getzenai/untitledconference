import { describe, expect, it } from 'vitest';
import {
	applyAssignmentWrites,
	assignmentWriteFromForm,
	type AssignmentWrite,
	type OptimisticAssignmentReviewer
} from './reviewer-assignment-optimistic';

const reviewer = (
	over: Partial<OptimisticAssignmentReviewer> & { userId: string }
): OptimisticAssignmentReviewer => ({
	status: null,
	unassignBlockReason: null,
	...over
});

const rounds = (...reviewers: OptimisticAssignmentReviewer[]) => [
	{ id: 10, name: 'Round 1', reviewers }
];

describe('assignmentWriteFromForm', () => {
	it('reads assign and unassign from the row form', () => {
		const assign = new FormData();
		assign.set('roundId', '10');
		assign.set('reviewerUserId', 'riley');
		assign.set('intent', 'assign');
		expect(assignmentWriteFromForm(assign)).toEqual({
			kind: 'assign',
			roundId: 10,
			reviewerUserId: 'riley'
		});

		const unassign = new FormData();
		unassign.set('roundId', '10');
		unassign.set('reviewerUserId', 'riley');
		unassign.set('intent', 'unassign');
		expect(assignmentWriteFromForm(unassign)).toEqual({
			kind: 'unassign',
			roundId: 10,
			reviewerUserId: 'riley'
		});
	});

	it('refuses a missing field or a made-up intent', () => {
		expect(assignmentWriteFromForm(new FormData())).toBeNull();

		const form = new FormData();
		form.set('roundId', '10');
		form.set('reviewerUserId', 'riley');
		form.set('intent', 'reassign');
		expect(assignmentWriteFromForm(form)).toBeNull();
	});
});

describe('applyAssignmentWrites', () => {
	it('paints Assign as assigned and Unassign as a free row', () => {
		const riley = reviewer({ userId: 'riley' });
		const afterAssign = applyAssignmentWrites(rounds(riley), [
			{ kind: 'assign', roundId: 10, reviewerUserId: 'riley' }
		]);
		expect(afterAssign[0].reviewers[0]).toMatchObject({
			userId: 'riley',
			status: 'assigned',
			unassignBlockReason: null
		});

		const afterUnassign = applyAssignmentWrites(afterAssign, [
			{ kind: 'unassign', roundId: 10, reviewerUserId: 'riley' }
		]);
		expect(afterUnassign[0].reviewers[0]).toMatchObject({
			userId: 'riley',
			status: null,
			unassignBlockReason: null
		});
	});

	it('reassigns a recused seat without touching the neighbour', () => {
		const riley = reviewer({ userId: 'riley', status: 'recused' });
		const sam = reviewer({ userId: 'sam', status: 'assigned' });
		const next = applyAssignmentWrites(rounds(riley, sam), [
			{ kind: 'assign', roundId: 10, reviewerUserId: 'riley' }
		]);

		expect(next[0].reviewers.map((row) => row.status)).toEqual(['assigned', 'assigned']);
	});

	it('leaves the server list alone when the write is dropped', () => {
		const start = rounds(reviewer({ userId: 'riley' }));
		const write: AssignmentWrite = { kind: 'assign', roundId: 10, reviewerUserId: 'riley' };
		expect(applyAssignmentWrites(start, [write])[0].reviewers[0].status).toBe('assigned');
		expect(applyAssignmentWrites(start, [])[0].reviewers[0].status).toBeNull();
	});

	it('ignores a write for a round or reviewer that is not on the page', () => {
		const start = rounds(reviewer({ userId: 'riley', status: 'assigned' }));
		expect(
			applyAssignmentWrites(start, [{ kind: 'unassign', roundId: 99, reviewerUserId: 'riley' }])[0]
				.reviewers[0].status
		).toBe('assigned');
		expect(
			applyAssignmentWrites(start, [
				{ kind: 'unassign', roundId: 10, reviewerUserId: 'missing' }
			])[0].reviewers[0].status
		).toBe('assigned');
	});
});
