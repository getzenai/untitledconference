/**
 * Accept / Decline / Assign on a withdrawn talk, through the door the
 * organizer page actually uses (#716).
 *
 * The domain suite already refuses the writes. What is only true here is the
 * wiring: a rebuilt form still hits the same refusal, and a reviewer of the
 * same conference cannot walk around it by posting the action themselves.
 */
import { WITHDRAWN_DECISION_REASON } from '$lib/conference/decision-summary';
import { WITHDRAWN_ASSIGN_REASON } from '$lib/conference/review-assignment';
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, membershipTable } from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `withdrawn-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const reviewerId = `reviewer-${suffix}`;
const slug = `conf-${suffix}`;

let conferenceId = 0;
let submissionId = 0;
let roundId = 0;

function decideEvent(decision: 'accepted' | 'rejected', userId: string) {
	const body = new FormData();
	body.append('decision', decision);
	return {
		request: new Request(`http://localhost/manage/${slug}/submissions/${submissionId}?/decide`, {
			method: 'POST',
			body
		}),
		params: { slug, id: String(submissionId) },
		locals: { user: { id: userId } }
	} as unknown as Parameters<typeof actions.decide>[0];
}

function assignEvent(userId: string) {
	const body = new FormData();
	body.append('roundId', String(roundId));
	body.append('reviewerUserId', reviewerId);
	body.append('intent', 'assign');
	return {
		request: new Request(
			`http://localhost/manage/${slug}/submissions/${submissionId}?/assignment`,
			{ method: 'POST', body }
		),
		params: { slug, id: String(submissionId) },
		locals: { user: { id: userId } }
	} as unknown as Parameters<typeof actions.assignment>[0];
}

const stored = async () => {
	const [row] = await db
		.select({ status: submissionTable.status, decidedAt: submissionTable.decidedAt })
		.from(submissionTable)
		.where(eq(submissionTable.id, submissionId));
	return row;
};

const assignmentCount = async () => {
	const rows = await db
		.select({ id: reviewTable.id })
		.from(reviewTable)
		.where(eq(reviewTable.submissionId, submissionId));
	return rows.length;
};

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Withdrawn Actions Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{
			id: organizerId,
			email: `${organizerId}@example.test`,
			emailVerified: true,
			name: 'An Organizer'
		},
		{
			id: reviewerId,
			email: `${reviewerId}@example.test`,
			emailVerified: true,
			name: 'A Reviewer'
		}
	]);
	await db.insert(member).values({
		id: `member-${suffix}`,
		organizationId,
		userId: organizerId,
		role: 'owner',
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Withdrawn Actions Conf', slug })
		.returning();
	conferenceId = conference.id;

	await db.insert(membershipTable).values({
		userId: reviewerId,
		role: 'reviewer',
		scopeType: 'conference',
		scopeId: conferenceId
	});

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId, name: 'Plan' })
		.returning();
	const [round] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: plan.id, name: 'Round 1' })
		.returning();
	roundId = round.id;

	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId, title: 'Taken back', status: 'withdrawn' })
		.returning();
	submissionId = submission.id;
});

afterAll(async () => {
	await db.delete(reviewTable).where(eq(reviewTable.submissionId, submissionId));
	await db.delete(submissionTable).where(eq(submissionTable.id, submissionId));
	await db.delete(reviewRoundTable).where(eq(reviewRoundTable.id, roundId));
	await db.delete(evaluationPlanTable).where(eq(evaluationPlanTable.conferenceId, conferenceId));
	await db.delete(membershipTable).where(eq(membershipTable.scopeId, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(member).where(eq(member.userId, organizerId));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, reviewerId));
});

describe('a withdrawn talk on the organizer page (#716)', () => {
	it('refuses Accept, Decline and Assign from the organizer, and changes nothing', async () => {
		expect(await actions.decide(decideEvent('accepted', organizerId))).toMatchObject({
			status: 400,
			data: { message: WITHDRAWN_DECISION_REASON }
		});
		expect(await actions.decide(decideEvent('rejected', organizerId))).toMatchObject({
			status: 400,
			data: { message: WITHDRAWN_DECISION_REASON }
		});
		expect(await actions.assignment(assignEvent(organizerId))).toMatchObject({
			status: 400,
			data: { assignmentMessage: WITHDRAWN_ASSIGN_REASON }
		});

		expect(await stored()).toMatchObject({ status: 'withdrawn', decidedAt: null });
		expect(await assignmentCount()).toBe(0);
	});

	it('refuses Accept, Decline and Assign from a reviewer of the same conference', async () => {
		await expect(actions.decide(decideEvent('accepted', reviewerId))).rejects.toMatchObject({
			status: 404
		});
		await expect(actions.decide(decideEvent('rejected', reviewerId))).rejects.toMatchObject({
			status: 404
		});
		await expect(actions.assignment(assignEvent(reviewerId))).rejects.toMatchObject({
			status: 404
		});

		expect(await stored()).toMatchObject({ status: 'withdrawn', decidedAt: null });
		expect(await assignmentCount()).toBe(0);
	});
});
