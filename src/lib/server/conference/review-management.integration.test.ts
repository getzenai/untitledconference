import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	queueReviewReminder,
	reviewAssignmentMatrix,
	reviewerProgress,
	setReviewAssignment
} from './review-management';
import { recuseReview, reviewerSubmission, reviewQueue } from './reviewer';

const suffix = `review-management-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const CONFERENCE_REVIEWER = `conference-reviewer-${suffix}`;
const ROUND_REVIEWER = `round-reviewer-${suffix}`;
const SPEAKER_REVIEWER = `speaker-reviewer-${suffix}`;
const OUTSIDER = `outsider-${suffix}`;
const userIds = [CONFERENCE_REVIEWER, ROUND_REVIEWER, SPEAKER_REVIEWER, OUTSIDER];

let conference: Conference;
let otherConference: Conference;
let roundId: number;
let otherRoundId: number;
let submissionId: number;
let otherSubmissionId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Review Management Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values(
		userIds.map((id) => ({
			id,
			name: id.split(`-${suffix}`)[0],
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		}))
	);
	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Review Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();

	for (const target of [conference, otherConference]) {
		const [plan] = await db
			.insert(evaluationPlanTable)
			.values({ conferenceId: target.id, name: 'Plan' })
			.returning();
		const [round] = await db
			.insert(reviewRoundTable)
			.values({ evaluationPlanId: plan.id, name: 'Round 1' })
			.returning();
		if (target.id === conference.id) roundId = round.id;
		else otherRoundId = round.id;
	}

	[submissionId] = (
		await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Managed submission', status: 'submitted' })
			.returning({ id: submissionTable.id })
	).map((row) => row.id);
	[otherSubmissionId] = (
		await db
			.insert(submissionTable)
			.values({ conferenceId: otherConference.id, title: 'Other submission', status: 'submitted' })
			.returning({ id: submissionTable.id })
	).map((row) => row.id);

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: SPEAKER_REVIEWER,
			name: 'Speaker Reviewer',
			sortName: 'Reviewer, Speaker',
			email: `${SPEAKER_REVIEWER}@example.com`
		})
		.returning();
	await db
		.insert(submissionSpeakerTable)
		.values({ submissionId, speakerProfileId: speaker.id, position: 0 });

	await db.insert(membershipTable).values([
		{
			userId: CONFERENCE_REVIEWER,
			role: 'reviewer',
			scopeType: 'conference',
			scopeId: conference.id
		},
		{ userId: ROUND_REVIEWER, role: 'reviewer', scopeType: 'round', scopeId: roundId },
		{
			userId: SPEAKER_REVIEWER,
			role: 'reviewer',
			scopeType: 'conference',
			scopeId: conference.id
		},
		{
			userId: OUTSIDER,
			role: 'reviewer',
			scopeType: 'conference',
			scopeId: otherConference.id
		}
	]);
});

beforeEach(async () => {
	await db.delete(reviewTable).where(inArray(reviewTable.reviewRoundId, [roundId, otherRoundId]));
	await db
		.delete(emailLogTable)
		.where(inArray(emailLogTable.conferenceId, [conference.id, otherConference.id]));
});

afterAll(async () => {
	await db.delete(membershipTable).where(inArray(membershipTable.userId, userIds));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(inArray(user.id, userIds));
});

describe('organizer reviewer assignments', () => {
	it('offers only the eligible, non-speaker pool and writes the exact assignment row', async () => {
		const before = await reviewAssignmentMatrix(conference.id, submissionId);
		expect(before[0].reviewers.map((reviewer) => reviewer.userId)).toEqual([
			CONFERENCE_REVIEWER,
			ROUND_REVIEWER
		]);

		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, CONFERENCE_REVIEWER, true)
		).toBe('assigned');
		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, SPEAKER_REVIEWER, true)
		).toBe('invalid');
		expect(await setReviewAssignment(conference.id, submissionId, roundId, OUTSIDER, true)).toBe(
			'invalid'
		);

		const after = await reviewAssignmentMatrix(conference.id, submissionId);
		expect(
			after[0].reviewers.find((reviewer) => reviewer.userId === CONFERENCE_REVIEWER)?.status
		).toBe('assigned');
	});

	it('restores a recused row and removes an assignment on request', async () => {
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: ROUND_REVIEWER,
			status: 'recused'
		});

		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, ROUND_REVIEWER, true)
		).toBe('assigned');
		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, ROUND_REVIEWER, false)
		).toBe('unassigned');

		const rows = await db
			.select()
			.from(reviewTable)
			.where(
				and(
					eq(reviewTable.reviewRoundId, roundId),
					eq(reviewTable.submissionId, submissionId),
					eq(reviewTable.reviewerUserId, ROUND_REVIEWER)
				)
			);
		expect(rows).toEqual([]);
	});

	it('keeps a submitted review when an organizer tries to unassign it', async () => {
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'submitted'
			})
			.returning();

		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, CONFERENCE_REVIEWER, false)
		).toBe('complete');
		expect(
			await db.select({ id: reviewTable.id }).from(reviewTable).where(eq(reviewTable.id, review.id))
		).toEqual([{ id: review.id }]);
	});
});

describe('reviewer progress and reminders', () => {
	it('groups active assignments per reviewer and excludes recused and neighbouring work', async () => {
		await db.insert(reviewTable).values([
			{
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'submitted'
			},
			{
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: ROUND_REVIEWER,
				status: 'recused'
			},
			{
				reviewRoundId: otherRoundId,
				submissionId: otherSubmissionId,
				reviewerUserId: OUTSIDER,
				status: 'assigned'
			}
		]);

		expect(await reviewerProgress(conference.id)).toEqual([
			expect.objectContaining({
				userId: CONFERENCE_REVIEWER,
				assigned: 1,
				submitted: 1,
				outstanding: 0
			})
		]);
	});

	it('queues one observable reminder, suppresses a repeat, and retries a failed send', async () => {
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: CONFERENCE_REVIEWER,
			status: 'assigned'
		});

		expect(await queueReviewReminder(conference, CONFERENCE_REVIEWER)).toBe('queued');
		expect(await queueReviewReminder(conference, CONFERENCE_REVIEWER)).toBe('already_queued');

		let reminders = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.template, 'review_reminder'));
		expect(reminders).toHaveLength(1);
		expect(reminders[0]).toMatchObject({
			conferenceId: conference.id,
			toEmail: `${CONFERENCE_REVIEWER}@example.com`,
			status: 'queued',
			relatedType: 'reviewer'
		});

		await db
			.update(emailLogTable)
			.set({ status: 'failed' })
			.where(eq(emailLogTable.id, reminders[0].id));
		expect(await queueReviewReminder(conference, CONFERENCE_REVIEWER)).toBe('queued');
		reminders = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.template, 'review_reminder'));
		expect(reminders).toHaveLength(2);
	});
});

describe('reviewer recusal', () => {
	it('marks an outstanding review recused and removes it from queue and detail', async () => {
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'assigned'
			})
			.returning();

		expect(await recuseReview(conference.id, CONFERENCE_REVIEWER, submissionId, review.id)).toBe(
			true
		);
		expect(await reviewQueue(conference, CONFERENCE_REVIEWER)).toEqual([]);
		expect(await reviewerSubmission(conference, CONFERENCE_REVIEWER, submissionId)).toBeNull();
	});

	it('does not recuse a submitted review', async () => {
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'submitted'
			})
			.returning();

		expect(await recuseReview(conference.id, CONFERENCE_REVIEWER, submissionId, review.id)).toBe(
			false
		);
	});
});
