import { unassignBlockReason } from '$lib/conference/review-assignment';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	membershipTrackTable,
	speakerProfileTable,
	trackTable,
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
	assignReviewersToSubmissions,
	assignReviewerToSubmissions,
	autoDistributeReviews,
	conferenceAssignmentTargets,
	queueReviewReminders,
	reviewAssignmentMatrix,
	reviewerProgress,
	setReviewAssignment
} from './review-management';
import { recuseReview, reviewerSubmission, reviewQueue } from './reviewer';
import { committee } from './reviewer-roster';

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

	it('refuses a new assignment on a withdrawn talk and names the skip (#716)', async () => {
		const [withdrawn] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: `Withdrawn ${suffix}`,
				status: 'withdrawn'
			})
			.returning({ id: submissionTable.id });

		expect(
			await setReviewAssignment(conference.id, withdrawn.id, roundId, CONFERENCE_REVIEWER, true)
		).toBe('withdrawn');

		const matrix = await reviewAssignmentMatrix(conference.id, withdrawn.id);
		expect(matrix[0].reviewers.every((reviewer) => reviewer.eligible === false)).toBe(true);

		const bulk = await assignReviewerToSubmissions(
			conference.id,
			[withdrawn.id],
			roundId,
			CONFERENCE_REVIEWER
		);
		expect(bulk).toEqual({
			created: 0,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId: withdrawn.id, reason: 'withdrawn' }]
		});

		const seats = await db
			.select({ id: reviewTable.id })
			.from(reviewTable)
			.where(eq(reviewTable.submissionId, withdrawn.id));
		expect(seats).toHaveLength(0);

		await db.delete(submissionTable).where(eq(submissionTable.id, withdrawn.id));
	});

	/**
	 * ABS-06: one reviewer onto many selected submissions. Existing rows stay,
	 * speaker/outsider pairs skip, and the matrix on each submission is the
	 * source of truth after the batch.
	 */
	it('assigns one reviewer across several submissions without double-writing', async () => {
		const [secondId] = (
			await db
				.insert(submissionTable)
				.values({
					conferenceId: conference.id,
					title: `Bulk second ${suffix}`,
					status: 'submitted'
				})
				.returning({ id: submissionTable.id })
		).map((row) => row.id);

		// Pre-assign one of the two so the batch reports "already".
		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, CONFERENCE_REVIEWER, true)
		).toBe('assigned');

		const result = await assignReviewerToSubmissions(
			conference.id,
			[submissionId, secondId, secondId, otherSubmissionId],
			roundId,
			CONFERENCE_REVIEWER
		);
		// secondId created; submissionId already; otherSubmissionId is another
		// conference → invalid/skipped. Duplicate id is de-duped.
		expect(result).toEqual({
			created: 1,
			already: 1,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId: otherSubmissionId, reason: 'not_on_conference' }]
		});

		const first = await reviewAssignmentMatrix(conference.id, submissionId);
		const second = await reviewAssignmentMatrix(conference.id, secondId);
		expect(
			first[0].reviewers.find((reviewer) => reviewer.userId === CONFERENCE_REVIEWER)?.status
		).toBe('assigned');
		expect(
			second[0].reviewers.find((reviewer) => reviewer.userId === CONFERENCE_REVIEWER)?.status
		).toBe('assigned');

		// Speaker on the first submission cannot take the seat via bulk either.
		const speakerResult = await assignReviewerToSubmissions(
			conference.id,
			[submissionId],
			roundId,
			SPEAKER_REVIEWER
		);
		expect(speakerResult).toEqual({
			created: 0,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId, reason: 'speaker_conflict' }]
		});

		const targets = await conferenceAssignmentTargets(conference.id);
		expect(targets).toHaveLength(1);
		expect(targets[0].reviewers.map((reviewer) => reviewer.userId).sort()).toEqual(
			[CONFERENCE_REVIEWER, ROUND_REVIEWER, SPEAKER_REVIEWER].sort()
		);

		await db.delete(submissionTable).where(eq(submissionTable.id, secondId));
	});

	it('names not_in_round when the reviewer sits only on a different round', async () => {
		const [plan] = await db
			.select({ id: evaluationPlanTable.id })
			.from(evaluationPlanTable)
			.where(eq(evaluationPlanTable.conferenceId, conference.id));
		const [round2] = await db
			.insert(reviewRoundTable)
			.values({ evaluationPlanId: plan.id, name: `Round 2 ${suffix}` })
			.returning();

		expect(
			await assignReviewerToSubmissions(conference.id, [submissionId], round2.id, ROUND_REVIEWER)
		).toEqual({
			created: 0,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId, reason: 'not_in_round' }]
		});

		await db.delete(reviewRoundTable).where(eq(reviewRoundTable.id, round2.id));
	});

	it('enforces the committee track allow-list in both the matrix and the write', async () => {
		const [allowedTrack, blockedTrack] = await db
			.insert(trackTable)
			.values([
				{ conferenceId: conference.id, name: `Allowed ${suffix}` },
				{ conferenceId: conference.id, name: `Blocked ${suffix}` }
			])
			.returning();
		const [membership] = await db
			.select({ id: membershipTable.id })
			.from(membershipTable)
			.where(eq(membershipTable.userId, CONFERENCE_REVIEWER));
		await db
			.insert(membershipTrackTable)
			.values({ membershipId: membership.id, trackId: allowedTrack.id });
		await db
			.update(submissionTable)
			.set({ trackId: blockedTrack.id })
			.where(eq(submissionTable.id, submissionId));

		expect(
			(await reviewAssignmentMatrix(conference.id, submissionId))[0].reviewers.map(
				(reviewer) => reviewer.userId
			)
		).not.toContain(CONFERENCE_REVIEWER);
		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, CONFERENCE_REVIEWER, true)
		).toBe('invalid');
		expect(
			await assignReviewerToSubmissions(conference.id, [submissionId], roundId, CONFERENCE_REVIEWER)
		).toEqual({
			created: 0,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId, reason: 'track_restricted' }]
		});

		await db
			.update(submissionTable)
			.set({ trackId: allowedTrack.id })
			.where(eq(submissionTable.id, submissionId));
		expect(
			(await reviewAssignmentMatrix(conference.id, submissionId))[0].reviewers.map(
				(reviewer) => reviewer.userId
			)
		).toContain(CONFERENCE_REVIEWER);

		await db
			.delete(membershipTrackTable)
			.where(eq(membershipTrackTable.membershipId, membership.id));
		await db
			.update(submissionTable)
			.set({ trackId: null })
			.where(eq(submissionTable.id, submissionId));
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

	it('bulk-assign leaves recused rows alone and counts them separately', async () => {
		const [freshId] = (
			await db
				.insert(submissionTable)
				.values({
					conferenceId: conference.id,
					title: `Bulk recused ${suffix}`,
					status: 'submitted'
				})
				.returning({ id: submissionTable.id })
		).map((row) => row.id);

		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: ROUND_REVIEWER,
			status: 'recused'
		});

		const result = await assignReviewerToSubmissions(
			conference.id,
			[submissionId, freshId],
			roundId,
			ROUND_REVIEWER
		);
		expect(result).toEqual({
			created: 1,
			already: 0,
			skipped: 0,
			recused: 1,
			skippedItems: []
		});

		const [stillRecused] = await db
			.select({ status: reviewTable.status })
			.from(reviewTable)
			.where(
				and(
					eq(reviewTable.reviewRoundId, roundId),
					eq(reviewTable.submissionId, submissionId),
					eq(reviewTable.reviewerUserId, ROUND_REVIEWER)
				)
			);
		expect(stillRecused?.status).toBe('recused');

		// Single-cell reassign still restores — that click is deliberate.
		expect(
			await setReviewAssignment(conference.id, submissionId, roundId, ROUND_REVIEWER, true)
		).toBe('assigned');

		await db
			.delete(reviewTable)
			.where(
				and(eq(reviewTable.reviewRoundId, roundId), eq(reviewTable.reviewerUserId, ROUND_REVIEWER))
			);
		await db.delete(submissionTable).where(eq(submissionTable.id, freshId));
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

		const matrix = await reviewAssignmentMatrix(conference.id, submissionId);
		const row = matrix
			.flatMap((round) => round.reviewers)
			.find((reviewer) => reviewer.userId === CONFERENCE_REVIEWER);
		expect(row?.unassignBlockReason).toBe(unassignBlockReason('submitted'));
	});
});

describe('ABS-06 assignment at scale', () => {
	async function insertTalks(titles: string[]) {
		const rows = await db
			.insert(submissionTable)
			.values(
				titles.map((title) => ({
					conferenceId: conference.id,
					title: `${title} ${suffix}`,
					status: 'submitted' as const
				}))
			)
			.returning({ id: submissionTable.id });
		return rows.map((row) => row.id);
	}

	it('assigns two reviewers onto five talks in one call and names the skips', async () => {
		const talkIds = await insertTalks(['A', 'B', 'C', 'D', 'E']);

		const result = await assignReviewersToSubmissions(conference.id, talkIds, roundId, [
			CONFERENCE_REVIEWER,
			ROUND_REVIEWER
		]);
		expect(result).toEqual({
			created: 10,
			already: 0,
			skipped: 0,
			recused: 0,
			skippedItems: []
		});

		for (const talkId of talkIds) {
			const assigned = (await reviewAssignmentMatrix(conference.id, talkId))[0].reviewers
				.filter((reviewer) => reviewer.status === 'assigned')
				.map((reviewer) => reviewer.userId)
				.sort();
			expect(assigned).toEqual([CONFERENCE_REVIEWER, ROUND_REVIEWER].sort());
		}

		expect(await reviewQueue(conference, CONFERENCE_REVIEWER)).toHaveLength(5);
		expect(await reviewQueue(conference, ROUND_REVIEWER)).toHaveLength(5);

		const again = await assignReviewersToSubmissions(conference.id, talkIds, roundId, [
			CONFERENCE_REVIEWER,
			ROUND_REVIEWER
		]);
		expect(again).toEqual({
			created: 0,
			already: 10,
			skipped: 0,
			recused: 0,
			skippedItems: []
		});

		await db.delete(submissionTable).where(inArray(submissionTable.id, talkIds));
	});

	it('keeps a speaker conflict on A from blocking B on the same talk', async () => {
		const result = await assignReviewersToSubmissions(conference.id, [submissionId], roundId, [
			SPEAKER_REVIEWER,
			CONFERENCE_REVIEWER
		]);
		expect(result).toEqual({
			created: 1,
			already: 0,
			skipped: 1,
			recused: 0,
			skippedItems: [{ submissionId, reason: 'speaker_conflict' }]
		});

		const assigned = (await reviewAssignmentMatrix(conference.id, submissionId))[0].reviewers.find(
			(reviewer) => reviewer.status === 'assigned'
		);
		expect(assigned?.userId).toBe(CONFERENCE_REVIEWER);
	});

	it('auto-distributes under a cap and never restores a recusal', async () => {
		// Three conference-scoped reviewers exist. Four talks × cap 1 exhausts the
		// pool; the recusal on the first talk must not be flipped to make a fourth.
		const talkIds = await insertTalks(['D1', 'D2', 'D3', 'D4']);

		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId: talkIds[0],
			reviewerUserId: CONFERENCE_REVIEWER,
			status: 'recused'
		});

		const result = await autoDistributeReviews(conference.id, talkIds, roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 1
		});

		expect(result.created).toBe(3);
		expect(result.skipped).toBe(1);
		expect(result.skipped).toBe(result.skippedItems.length);
		expect(result.skippedItems).toEqual([{ submissionId: talkIds[3], reason: 'pool_exhausted' }]);

		const recused = await db
			.select({ status: reviewTable.status })
			.from(reviewTable)
			.where(
				and(
					eq(reviewTable.reviewRoundId, roundId),
					eq(reviewTable.submissionId, talkIds[0]),
					eq(reviewTable.reviewerUserId, CONFERENCE_REVIEWER)
				)
			);
		expect(recused).toEqual([{ status: 'recused' }]);
		expect(
			(await reviewQueue(conference, CONFERENCE_REVIEWER)).some(
				(row) => row.submissionId === talkIds[0]
			)
		).toBe(false);

		await db.delete(submissionTable).where(inArray(submissionTable.id, talkIds));
	});

	it('does not assign a speaker-reviewer or a track-blocked reviewer when filling N', async () => {
		const [allowedTrack, blockedTrack] = await db
			.insert(trackTable)
			.values([
				{ conferenceId: conference.id, name: `Dist allowed ${suffix}` },
				{ conferenceId: conference.id, name: `Dist blocked ${suffix}` }
			])
			.returning();
		const [membership] = await db
			.select({ id: membershipTable.id })
			.from(membershipTable)
			.where(eq(membershipTable.userId, CONFERENCE_REVIEWER));
		await db
			.insert(membershipTrackTable)
			.values({ membershipId: membership.id, trackId: allowedTrack.id });

		const [talkId] = await insertTalks(['Blocked track']);
		await db
			.update(submissionTable)
			.set({ trackId: blockedTrack.id })
			.where(eq(submissionTable.id, talkId));

		const blocked = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10
		});
		expect(blocked.created).toBe(1);
		const blockedAssignee = (await reviewAssignmentMatrix(conference.id, talkId))[0].reviewers.find(
			(reviewer) => reviewer.status === 'assigned'
		)?.userId;
		expect(blockedAssignee).not.toBe(CONFERENCE_REVIEWER);

		const ownTalk = await autoDistributeReviews(conference.id, [submissionId], roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10
		});
		expect(ownTalk.created).toBe(1);
		const speakerMatrix = await reviewAssignmentMatrix(conference.id, submissionId);
		expect(
			speakerMatrix[0].reviewers.find((reviewer) => reviewer.userId === SPEAKER_REVIEWER)?.status
		).not.toBe('assigned');

		await db
			.delete(membershipTrackTable)
			.where(eq(membershipTrackTable.membershipId, membership.id));
		await db.update(submissionTable).set({ trackId: null }).where(eq(submissionTable.id, talkId));
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
		await db.delete(trackTable).where(inArray(trackTable.id, [allowedTrack.id, blockedTrack.id]));
	});

	it('counts a dual-scoped reviewer once when filling N', async () => {
		const [talkId] = await insertTalks(['Dual seat']);
		await db.insert(membershipTable).values({
			userId: CONFERENCE_REVIEWER,
			role: 'reviewer',
			scopeType: 'round',
			scopeId: roundId
		});

		const result = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 2,
			capPerReviewer: 10
		});
		// Without user-dedup this reports created=1, already=1 and leaves one seat empty.
		expect(result.created).toBe(2);
		expect(result.already).toBe(0);
		const assigned = (await reviewAssignmentMatrix(conference.id, talkId))[0].reviewers
			.filter((reviewer) => reviewer.status === 'assigned')
			.map((reviewer) => reviewer.userId);
		expect(assigned).toHaveLength(2);
		expect(assigned).toContain(CONFERENCE_REVIEWER);

		await db
			.delete(membershipTable)
			.where(
				and(
					eq(membershipTable.userId, CONFERENCE_REVIEWER),
					eq(membershipTable.scopeType, 'round'),
					eq(membershipTable.scopeId, roundId)
				)
			);
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
	});

	it('auto-distributes only among the reviewers the organizer checked', async () => {
		const talkIds = await insertTalks(['P1', 'P2']);
		const result = await autoDistributeReviews(conference.id, talkIds, roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10,
			reviewerUserIds: [ROUND_REVIEWER]
		});
		expect(result.created).toBe(2);
		for (const talkId of talkIds) {
			const assigned = (await reviewAssignmentMatrix(conference.id, talkId))[0].reviewers.find(
				(reviewer) => reviewer.status === 'assigned'
			)?.userId;
			expect(assigned).toBe(ROUND_REVIEWER);
		}
		await db.delete(submissionTable).where(inArray(submissionTable.id, talkIds));
	});

	it('records one skip item per unfilled seat and names the empty pool', async () => {
		const [talkId] = await insertTalks(['Empty pool']);
		const result = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 2,
			capPerReviewer: 10,
			reviewerUserIds: ['nobody-on-the-committee']
		});
		expect(result.created).toBe(0);
		expect(result.skipped).toBe(2);
		expect(result.skipped).toBe(result.skippedItems.length);
		expect(result.skippedItems).toEqual([
			{ submissionId: talkId, reason: 'empty_committee' },
			{ submissionId: talkId, reason: 'empty_committee' }
		]);
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
	});

	it('names a committee too small for N apart from a cap that nobody reached', async () => {
		// Two reviewers, three reviews wanted, cap 10 — the live case behind #384.
		// Both sit down, the third seat has nobody left to ask, and the cap never
		// came into it: reporting "over the cap" would send the organizer to raise
		// a number that is not in the way.
		const [talkId] = await insertTalks(['Too few people']);
		const result = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 3,
			capPerReviewer: 10,
			reviewerUserIds: [CONFERENCE_REVIEWER, ROUND_REVIEWER]
		});

		expect(result.created).toBe(2);
		expect(result.skipped).toBe(1);
		expect(result.skipped).toBe(result.skippedItems.length);
		expect(result.skippedItems).toEqual([{ submissionId: talkId, reason: 'committee_too_small' }]);

		await db.delete(reviewTable).where(eq(reviewTable.submissionId, talkId));
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
	});

	it('keeps the cap reason for the one case that is really the cap', async () => {
		// Same committee of two, but one seat each is all they may hold. The first
		// talk fills both; on the second everybody is free of the paper and barred
		// by the cap alone — the reason that #384 left `pool_exhausted` to mean.
		const talkIds = await insertTalks(['Cap first', 'Cap second']);
		const result = await autoDistributeReviews(conference.id, talkIds, roundId, {
			reviewsPerSubmission: 2,
			capPerReviewer: 1,
			reviewerUserIds: [CONFERENCE_REVIEWER, ROUND_REVIEWER]
		});

		expect(result.created).toBe(2);
		expect(result.skipped).toBe(result.skippedItems.length);
		expect(result.skippedItems).toEqual([
			{ submissionId: talkIds[1], reason: 'pool_exhausted' },
			{ submissionId: talkIds[1], reason: 'pool_exhausted' }
		]);

		await db.delete(reviewTable).where(inArray(reviewTable.submissionId, talkIds));
		await db.delete(submissionTable).where(inArray(submissionTable.id, talkIds));
	});

	it('names a track lock when every remaining candidate is barred from the talk', async () => {
		const [allowedTrack, blockedTrack] = await db
			.insert(trackTable)
			.values([
				{ conferenceId: conference.id, name: `Skip allowed ${suffix}` },
				{ conferenceId: conference.id, name: `Skip blocked ${suffix}` }
			])
			.returning();
		const [membership] = await db
			.select({ id: membershipTable.id })
			.from(membershipTable)
			.where(eq(membershipTable.userId, CONFERENCE_REVIEWER));
		await db
			.insert(membershipTrackTable)
			.values({ membershipId: membership.id, trackId: allowedTrack.id });

		const [talkId] = await insertTalks(['All blocked']);
		await db
			.update(submissionTable)
			.set({ trackId: blockedTrack.id })
			.where(eq(submissionTable.id, talkId));

		const result = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10,
			reviewerUserIds: [CONFERENCE_REVIEWER]
		});
		expect(result.created).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.skipped).toBe(result.skippedItems.length);
		expect(result.skippedItems).toEqual([{ submissionId: talkId, reason: 'track_restricted' }]);

		await db
			.delete(membershipTrackTable)
			.where(eq(membershipTrackTable.membershipId, membership.id));
		await db.update(submissionTable).set({ trackId: null }).where(eq(submissionTable.id, talkId));
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
		await db.delete(trackTable).where(inArray(trackTable.id, [allowedTrack.id, blockedTrack.id]));
	});

	it('unions track allow-lists across a dual-scoped reviewer in either row order', async () => {
		const dualId = `dual-track-${suffix}`;
		await db.insert(user).values({
			id: dualId,
			name: 'Dual Track',
			email: `${dualId}@example.com`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
		const [trackA, trackB, trackC] = await db
			.insert(trackTable)
			.values([
				{ conferenceId: conference.id, name: `Union A ${suffix}` },
				{ conferenceId: conference.id, name: `Union B ${suffix}` },
				{ conferenceId: conference.id, name: `Union C ${suffix}` }
			])
			.returning();

		const conferenceSeat = {
			userId: dualId,
			role: 'reviewer' as const,
			scopeType: 'conference' as const,
			scopeId: conference.id
		};
		const roundSeat = {
			userId: dualId,
			role: 'reviewer' as const,
			scopeType: 'round' as const,
			scopeId: roundId
		};

		async function restrict(conferenceFirst: boolean) {
			await db.delete(membershipTable).where(eq(membershipTable.userId, dualId));
			const inserted = await db
				.insert(membershipTable)
				.values(conferenceFirst ? [conferenceSeat, roundSeat] : [roundSeat, conferenceSeat])
				.returning({ id: membershipTable.id, scopeType: membershipTable.scopeType });
			const conferenceMembership = inserted.find((row) => row.scopeType === 'conference');
			const roundMembership = inserted.find((row) => row.scopeType === 'round');
			await db.insert(membershipTrackTable).values([
				{ membershipId: conferenceMembership!.id, trackId: trackA.id },
				{ membershipId: roundMembership!.id, trackId: trackB.id }
			]);
		}

		async function distributeOnto(track: typeof trackA) {
			const [talkId] = await insertTalks([`Union ${track.id}`]);
			await db
				.update(submissionTable)
				.set({ trackId: track.id })
				.where(eq(submissionTable.id, talkId));
			const result = await autoDistributeReviews(conference.id, [talkId], roundId, {
				reviewsPerSubmission: 1,
				capPerReviewer: 10,
				reviewerUserIds: [dualId]
			});
			await db.delete(reviewTable).where(eq(reviewTable.submissionId, talkId));
			await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
			return result;
		}

		// Last row is the round seat (track B). Talk on A would fail if that row were the only gate.
		await restrict(true);
		expect(await distributeOnto(trackA)).toMatchObject({ created: 1, skipped: 0 });

		// Last row is the conference seat (track A). Talk on B would fail without the union.
		await restrict(false);
		expect(await distributeOnto(trackB)).toMatchObject({ created: 1, skipped: 0 });

		const blocked = await distributeOnto(trackC);
		expect(blocked.created).toBe(0);
		expect(blocked.skipped).toBe(blocked.skippedItems.length);
		expect(blocked.skippedItems).toEqual([expect.objectContaining({ reason: 'track_restricted' })]);

		await db.delete(membershipTable).where(eq(membershipTable.userId, dualId));
		await db.delete(trackTable).where(inArray(trackTable.id, [trackA.id, trackB.id, trackC.id]));
		await db.delete(user).where(eq(user.id, dualId));
	});

	it('is a no-op when every selected talk already has N reviewers', async () => {
		const [talkId] = await insertTalks(['Full']);
		const first = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10
		});
		expect(first.created).toBe(1);
		const again = await autoDistributeReviews(conference.id, [talkId], roundId, {
			reviewsPerSubmission: 1,
			capPerReviewer: 10
		});
		expect(again).toMatchObject({ created: 0, already: 1, skipped: 0 });
		await db.delete(submissionTable).where(eq(submissionTable.id, talkId));
	});
});

describe('reviewer progress and reminders', () => {
	it('groups active assignments per reviewer and excludes recused and neighbouring work', async () => {
		await db.insert(reviewTable).values([
			{
				reviewRoundId: roundId,
				submissionId,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'submitted',
				submittedAt: new Date()
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

	it('uses the same actionable assignment counts as the reviewer roster', async () => {
		const [pending, submitted, draft, withdrawn] = await db
			.insert(submissionTable)
			.values([
				{ conferenceId: conference.id, title: 'Pending review', status: 'submitted' },
				{ conferenceId: conference.id, title: 'Completed review', status: 'submitted' },
				{ conferenceId: conference.id, title: 'Speaker draft', status: 'draft' },
				{ conferenceId: conference.id, title: 'Withdrawn talk', status: 'withdrawn' }
			])
			.returning({ id: submissionTable.id });
		const submittedAt = new Date();
		await db.insert(reviewTable).values([
			{
				reviewRoundId: roundId,
				submissionId: pending.id,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'assigned'
			},
			{
				reviewRoundId: roundId,
				submissionId: submitted.id,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'submitted',
				submittedAt
			},
			{
				reviewRoundId: roundId,
				submissionId: draft.id,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'assigned'
			},
			{
				reviewRoundId: roundId,
				submissionId: withdrawn.id,
				reviewerUserId: CONFERENCE_REVIEWER,
				status: 'assigned'
			}
		]);

		const dashboard = (await reviewerProgress(conference.id)).find(
			(row) => row.userId === CONFERENCE_REVIEWER
		);
		const roster = (await committee(conference.id)).find(
			(row) => row.userId === CONFERENCE_REVIEWER
		);

		expect(dashboard).toMatchObject({ assigned: 3, submitted: 1, outstanding: 1 });
		expect(dashboard).toMatchObject({
			assigned: roster?.assigned,
			submitted: roster?.submitted,
			outstanding: roster?.outstanding
		});
	});

	it('queues one observable reminder, suppresses a repeat, and retries a failed send', async () => {
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: CONFERENCE_REVIEWER,
			status: 'assigned'
		});

		expect(await queueReviewReminders(conference, [CONFERENCE_REVIEWER])).toMatchObject({
			queued: 1
		});
		expect(await queueReviewReminders(conference, [CONFERENCE_REVIEWER])).toMatchObject({
			already_queued: 1
		});

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
		expect(await queueReviewReminders(conference, [CONFERENCE_REVIEWER])).toMatchObject({
			queued: 1
		});
		reminders = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.template, 'review_reminder'));
		expect(reminders).toHaveLength(2);
	});

	/**
	 * ABS-09. The point of the tally is that a mixed selection is normal: the
	 * organizer ticks the box next to everybody and the function decides who a
	 * reminder is actually for. One caller, three different outcomes, one email.
	 */
	it('reminds a mixed selection and accounts for everyone it skipped', async () => {
		await db.insert(reviewTable).values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: CONFERENCE_REVIEWER,
			status: 'assigned'
		});

		expect(
			await queueReviewReminders(conference, [
				CONFERENCE_REVIEWER,
				// Assigned nothing, so there is nothing to chase them about.
				ROUND_REVIEWER,
				// No such account: the address is what an email needs, and there is none.
				`ghost-${suffix}`,
				// The same person twice — one tick, one click, one email.
				CONFERENCE_REVIEWER
			])
		).toEqual({ queued: 1, already_queued: 0, nothing_outstanding: 1, no_email: 1 });

		expect(
			await db.select().from(emailLogTable).where(eq(emailLogTable.template, 'review_reminder'))
		).toHaveLength(1);
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

		// The title rides along so the queue can name what was handed back (#463);
		// what this test is about is the removal, so it asserts the flag, not the
		// whole shape.
		expect(
			await recuseReview(conference.id, CONFERENCE_REVIEWER, submissionId, review.id)
		).toMatchObject({ ok: true });
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

		expect(await recuseReview(conference.id, CONFERENCE_REVIEWER, submissionId, review.id)).toEqual(
			{ ok: false, reason: 'not_found' }
		);
	});
});
