/**
 * Post-login hub data: events, open work, sourcing flag — never a forced redirect.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHomeDashboard } from './home';

const suffix = `home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgId = `org-${suffix}`;
const ownerId = `owner-${suffix}`;
const reviewerId = `reviewer-${suffix}`;
const speakerId = `speaker-${suffix}`;

let conferenceId = 0;
let submissionId = 0;
let profileId = 0;
let planId = 0;
let roundId = 0;
let reviewId = 0;

beforeAll(async () => {
	await db.insert(organization).values({
		id: orgId,
		name: 'Home Org',
		slug: orgId,
		createdAt: new Date()
	});

	for (const [id, name] of [
		[ownerId, 'Owner'],
		[reviewerId, 'Reviewer'],
		[speakerId, 'Speaker']
	] as const) {
		await db.insert(user).values({
			id,
			name,
			email: `${id}@example.test`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	await db.insert(member).values({
		id: `seat-${suffix}`,
		organizationId: orgId,
		userId: ownerId,
		role: 'owner',
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId: orgId,
			name: 'Home Conf',
			slug: `home-conf-${suffix}`,
			status: 'published',
			startsOn: '2027-06-01',
			endsOn: '2027-06-02'
		})
		.returning();
	conferenceId = conference.id;

	const [profile] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId: orgId,
			name: 'Speaker Person',
			sortName: 'Person, Speaker',
			email: `${speakerId}@example.test`,
			userId: speakerId
		})
		.returning();
	profileId = profile.id;

	const [submission] = await db
		.insert(submissionTable)
		.values({
			conferenceId,
			title: 'Open talk for review',
			status: 'in_review',
			submittedAt: new Date()
		})
		.returning();
	submissionId = submission.id;

	const [plan] = await db
		.insert(evaluationPlanTable)
		.values({ conferenceId, name: 'Main plan' })
		.returning();
	planId = plan.id;

	const [round] = await db
		.insert(reviewRoundTable)
		.values({ evaluationPlanId: planId, name: 'Round 1', position: 0 })
		.returning();
	roundId = round.id;

	await db.insert(membershipTable).values({
		userId: reviewerId,
		role: 'reviewer',
		scopeType: 'round',
		scopeId: roundId
	});

	const [review] = await db
		.insert(reviewTable)
		.values({
			reviewRoundId: roundId,
			submissionId,
			reviewerUserId: reviewerId,
			status: 'assigned'
		})
		.returning();
	reviewId = review.id;
});

afterAll(async () => {
	if (reviewId) await db.delete(reviewTable).where(eq(reviewTable.id, reviewId));
	await db.delete(membershipTable).where(eq(membershipTable.userId, reviewerId));
	if (roundId) await db.delete(reviewRoundTable).where(eq(reviewRoundTable.id, roundId));
	if (planId) await db.delete(evaluationPlanTable).where(eq(evaluationPlanTable.id, planId));
	if (submissionId) await db.delete(submissionTable).where(eq(submissionTable.id, submissionId));
	if (profileId) await db.delete(speakerProfileTable).where(eq(speakerProfileTable.id, profileId));
	if (conferenceId) await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(member).where(eq(member.userId, ownerId));
	await db.delete(organization).where(eq(organization.id, orgId));
	for (const id of [ownerId, reviewerId, speakerId]) {
		await db.delete(user).where(eq(user.id, id));
	}
});

describe('loadHomeDashboard', () => {
	it('gives an organizer their events and a sourcing jump, not a forced single-event path', async () => {
		const hub = await loadHomeDashboard(ownerId);

		expect(hub.events).toHaveLength(1);
		expect(hub.events[0].slug).toBe(`home-conf-${suffix}`);
		expect(hub.canCreateEvent).toBe(true);
		expect(hub.canSourcing).toBe(true);
		// The page links into the event — the load never redirects.
		expect(hub.events[0].id).toBe(conferenceId);
	});

	it('lists assigned open reviews for a reviewer', async () => {
		const hub = await loadHomeDashboard(reviewerId);

		expect(hub.events).toEqual([]);
		expect(hub.canSourcing).toBe(false);
		// `toMatchObject`, not `toEqual`: the row carries the round's window and the
		// coverage count as well (#465), and this test is about who gets listed.
		expect(hub.openReviews).toMatchObject([
			{
				submissionId,
				title: 'Open talk for review',
				conference: { slug: `home-conf-${suffix}`, name: 'Home Conf' }
			}
		]);
		expect(hub.openReviewCounts).toEqual({ total: 1, filable: 1 });
		expect(hub.reviewConferences.map((c) => c.id)).toContain(conferenceId);
	});

	/**
	 * #465: the hub showed six of twenty-two by review id — insertion order — so
	 * the talks nobody had looked at were missing and a round that opens next week
	 * could take one of the six slots. A short list is a recommendation whether or
	 * not it admits to being one.
	 */
	it('ranks what can be filed, and what nobody has covered, above the rest', async () => {
		const later = await db
			.insert(reviewRoundTable)
			.values({
				evaluationPlanId: planId,
				name: 'Round 2',
				position: 1,
				opensAt: new Date(Date.now() + 7 * 86_400_000)
			})
			.returning();
		const [waiting, covered] = await db
			.insert(submissionTable)
			.values([
				{ conferenceId, title: 'Opens next week', status: 'in_review', submittedAt: new Date() },
				{ conferenceId, title: 'Already covered', status: 'in_review', submittedAt: new Date() }
			])
			.returning();

		const extra = await db
			.insert(reviewTable)
			.values([
				// Assigned to me in a round that has not opened: real work, not tonight's.
				{
					reviewRoundId: later[0].id,
					submissionId: waiting.id,
					reviewerUserId: reviewerId,
					status: 'assigned'
				},
				// Assigned to me in the open round, but somebody else has already filed.
				{
					reviewRoundId: roundId,
					submissionId: covered.id,
					reviewerUserId: reviewerId,
					status: 'assigned'
				},
				{
					reviewRoundId: roundId,
					submissionId: covered.id,
					reviewerUserId: ownerId,
					status: 'submitted'
				}
			])
			.returning();

		try {
			const hub = await loadHomeDashboard(reviewerId);

			expect(hub.openReviews.map((r) => r.title)).toEqual([
				'Open talk for review',
				'Already covered',
				'Opens next week'
			]);
			// Three jobs, two of them tonight's.
			expect(hub.openReviewCounts).toEqual({ total: 3, filable: 2 });
			expect(hub.openReviews[0].reviewsFiled).toBe(0);
			expect(hub.openReviews[2].window.state).toBe('not_yet_open');
		} finally {
			for (const row of extra) await db.delete(reviewTable).where(eq(reviewTable.id, row.id));
			await db.delete(submissionTable).where(eq(submissionTable.id, waiting.id));
			await db.delete(submissionTable).where(eq(submissionTable.id, covered.id));
			await db.delete(reviewRoundTable).where(eq(reviewRoundTable.id, later[0].id));
		}
	});

	it('returns a real empty state for a stranger with no seats', async () => {
		const strangerId = `stranger-${suffix}`;
		await db.insert(user).values({
			id: strangerId,
			name: 'Stranger',
			email: `${strangerId}@example.test`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		try {
			const hub = await loadHomeDashboard(strangerId);
			expect(hub.events).toEqual([]);
			expect(hub.openReviews).toEqual([]);
			expect(hub.openSubmissions).toEqual([]);
			expect(hub.openTasks).toEqual([]);
			expect(hub.canCreateEvent).toBe(false);
			expect(hub.canSourcing).toBe(false);
		} finally {
			await db.delete(user).where(eq(user.id, strangerId));
		}
	});
});
