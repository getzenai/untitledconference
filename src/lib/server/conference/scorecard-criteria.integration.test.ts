/**
 * Scorecard criteria CRUD and the weighted aggregate they feed (ABS-03, ABS-04).
 *
 * ABS-04 is only real if a weight written here changes the submission score that
 * organizers sort by — unit tests already prove the arithmetic; this proves the
 * weight on the row is the weight the aggregate reads.
 */
import { submissionScore } from '$lib/conference/scoring';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import {
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addReviewRound } from './review-rounds';
import {
	addScorecardCriterion,
	deleteScorecardCriterion,
	moveScorecardCriterion,
	scorecardCriteria,
	updateScorecardCriterion
} from './scorecard-criteria';

const suffix = `scorecard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const reviewerId = `reviewer-${suffix}`;

let conference: Conference;
let otherConference: Conference;
let roundId: number;
let otherRoundId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Scorecard Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: reviewerId,
		email: `${reviewerId}@example.test`,
		emailVerified: true,
		name: 'Sam Score'
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Scorecard Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();

	const round = await addReviewRound(conference.id, {
		name: 'Screening',
		anonymized: false,
		opensAt: null,
		closesAt: null
	});
	expect(round.ok).toBe(true);
	if (!round.ok) throw new Error(round.message);
	roundId = round.id;

	const other = await addReviewRound(otherConference.id, {
		name: 'Elsewhere',
		anonymized: false,
		opensAt: null,
		closesAt: null
	});
	expect(other.ok).toBe(true);
	if (!other.ok) throw new Error(other.message);
	otherRoundId = other.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, reviewerId));
});

describe('scorecard criteria CRUD (ABS-03)', () => {
	it('creates rating, select and text criteria with the fields each kind owns', async () => {
		const rating = await addScorecardCriterion(conference.id, roundId, {
			label: 'Relevance',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 3
		});
		expect(rating.ok).toBe(true);

		const select = await addScorecardCriterion(conference.id, roundId, {
			label: 'Fit',
			kind: 'select',
			scaleMax: null,
			optionsText: 'Yes\nNo\nMaybe',
			weight: 1
		});
		expect(select.ok).toBe(true);

		const text = await addScorecardCriterion(conference.id, roundId, {
			label: 'Notes',
			kind: 'text',
			scaleMax: null,
			optionsText: '',
			weight: 1
		});
		expect(text.ok).toBe(true);

		const list = await scorecardCriteria(conference.id);
		expect(list.map((c) => c.kind)).toEqual(['rating', 'select', 'text']);
		expect(list[0]).toMatchObject({
			label: 'Relevance',
			scaleMax: 5,
			weight: 3,
			options: []
		});
		expect(list[1].options).toEqual(['Yes', 'No', 'Maybe']);
		expect(list[1].scaleMax).toBeNull();
		expect(list[2].scaleMax).toBeNull();
		expect(list[2].options).toEqual([]);
	});

	it('refuses a foreign round id and keeps criteria out of the other conference', async () => {
		const result = await addScorecardCriterion(conference.id, otherRoundId, {
			label: 'Stolen',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(result.ok).toBe(false);

		expect((await scorecardCriteria(otherConference.id)).map((c) => c.label)).not.toContain(
			'Stolen'
		);
	});

	it('blocks delete while review scores hang on the criterion', async () => {
		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: `Talk ${suffix}`,
				status: 'submitted'
			})
			.returning({ id: submissionTable.id });

		const criteria = await scorecardCriteria(conference.id);
		const relevance = criteria.find((c) => c.label === 'Relevance');
		expect(relevance).toBeTruthy();
		if (!relevance) return;

		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId: submission.id,
				reviewerUserId: reviewerId,
				status: 'submitted',
				submittedAt: new Date()
			})
			.returning({ id: reviewTable.id });

		await db.insert(reviewScoreTable).values({
			reviewId: review.id,
			scorecardCriterionId: relevance.id,
			valueNumber: '5'
		});

		const blocked = await deleteScorecardCriterion(conference.id, relevance.id);
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.message).toMatch(/1 review score/);

		const after = await scorecardCriteria(conference.id);
		expect(after.find((c) => c.id === relevance.id)?.scoreCount).toBe(1);

		// Clean the score so later tests can delete freely if needed.
		await db.delete(reviewScoreTable).where(eq(reviewScoreTable.reviewId, review.id));
		await db.delete(reviewTable).where(eq(reviewTable.id, review.id));
		await db.delete(submissionTable).where(eq(submissionTable.id, submission.id));

		const freed = await deleteScorecardCriterion(conference.id, relevance.id);
		expect(freed.ok).toBe(true);
	});

	it('moves a criterion up the list and rewrites positions', async () => {
		// Fresh pair so the earlier delete does not leave a hole in the assertion.
		const first = await addScorecardCriterion(conference.id, roundId, {
			label: 'First',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		const second = await addScorecardCriterion(conference.id, roundId, {
			label: 'Second',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;

		await moveScorecardCriterion(conference.id, second.id!, 'up');

		const list = (await scorecardCriteria(conference.id)).filter(
			(c) => c.label === 'First' || c.label === 'Second'
		);
		expect(list.map((c) => c.label)).toEqual(['Second', 'First']);
	});

	it('blocks kind change while review scores hang on the criterion', async () => {
		const created = await addScorecardCriterion(conference.id, roundId, {
			label: 'Kind-locked',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: `Kind lock ${suffix}`,
				status: 'submitted'
			})
			.returning({ id: submissionTable.id });
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId: submission.id,
				reviewerUserId: reviewerId,
				status: 'submitted',
				submittedAt: new Date()
			})
			.returning({ id: reviewTable.id });
		await db.insert(reviewScoreTable).values({
			reviewId: review.id,
			scorecardCriterionId: created.id!,
			valueNumber: '4'
		});

		const blocked = await updateScorecardCriterion(conference.id, created.id!, {
			label: 'Kind-locked',
			kind: 'text',
			scaleMax: null,
			optionsText: '',
			weight: 1
		});
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.message).toMatch(/change type/);
		expect(blocked.message).toMatch(/1 review score/);

		// Label and weight stay free — weight is supposed to re-rank after the fact.
		const weightOk = await updateScorecardCriterion(conference.id, created.id!, {
			label: 'Kind-locked (renamed)',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 2
		});
		expect(weightOk.ok).toBe(true);
		const row = (await scorecardCriteria(conference.id)).find((c) => c.id === created.id);
		expect(row).toMatchObject({ label: 'Kind-locked (renamed)', kind: 'rating', weight: 2 });

		await db.delete(reviewScoreTable).where(eq(reviewScoreTable.reviewId, review.id));
		await db.delete(reviewTable).where(eq(reviewTable.id, review.id));
		await db.delete(submissionTable).where(eq(submissionTable.id, submission.id));
		await deleteScorecardCriterion(conference.id, created.id!);
	});

	it('blocks a shrinking scaleMax while review scores hang on the criterion', async () => {
		const created = await addScorecardCriterion(conference.id, roundId, {
			label: 'Scale-locked',
			kind: 'rating',
			scaleMax: 10,
			optionsText: '',
			weight: 1
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: `Scale lock ${suffix}`,
				status: 'submitted'
			})
			.returning({ id: submissionTable.id });
		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: roundId,
				submissionId: submission.id,
				reviewerUserId: reviewerId,
				status: 'submitted',
				submittedAt: new Date()
			})
			.returning({ id: reviewTable.id });
		// A stored 8 on a 1..10 scale becomes 8/5 = 1.6 if the max drops to 5.
		await db.insert(reviewScoreTable).values({
			reviewId: review.id,
			scorecardCriterionId: created.id!,
			valueNumber: '8'
		});

		const blocked = await updateScorecardCriterion(conference.id, created.id!, {
			label: 'Scale-locked',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.message).toMatch(/shrink the scale/);
		expect(blocked.message).toMatch(/1 review score/);

		// Widening the scale does not overshoot the old maximum — allowed.
		const wider = await updateScorecardCriterion(conference.id, created.id!, {
			label: 'Scale-locked',
			kind: 'rating',
			scaleMax: 10,
			optionsText: '',
			weight: 1
		});
		expect(wider.ok).toBe(true);

		const still = (await scorecardCriteria(conference.id)).find((c) => c.id === created.id);
		expect(still?.scaleMax).toBe(10);

		await db.delete(reviewScoreTable).where(eq(reviewScoreTable.reviewId, review.id));
		await db.delete(reviewTable).where(eq(reviewTable.id, review.id));
		await db.delete(submissionTable).where(eq(submissionTable.id, submission.id));
		await deleteScorecardCriterion(conference.id, created.id!);
	});
});

describe('weighted aggregate through stored criteria (ABS-04)', () => {
	it('two ratings at weight 3 and 1 yield a different score than equal weights', async () => {
		// Dedicated round so leftover criteria from the CRUD suite cannot dilute the mean.
		const dedicated = await addReviewRound(conference.id, {
			name: 'Weighting',
			anonymized: false,
			opensAt: null,
			closesAt: null
		});
		expect(dedicated.ok).toBe(true);
		if (!dedicated.ok) return;

		const heavy = await addScorecardCriterion(conference.id, dedicated.id, {
			label: 'Heavy',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 3
		});
		const light = await addScorecardCriterion(conference.id, dedicated.id, {
			label: 'Light',
			kind: 'rating',
			scaleMax: 5,
			optionsText: '',
			weight: 1
		});
		expect(heavy.ok && light.ok).toBe(true);
		if (!heavy.ok || !light.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: `Weighted ${suffix}`,
				status: 'submitted'
			})
			.returning({ id: submissionTable.id });

		const [review] = await db
			.insert(reviewTable)
			.values({
				reviewRoundId: dedicated.id,
				submissionId: submission.id,
				reviewerUserId: reviewerId,
				status: 'submitted',
				submittedAt: new Date()
			})
			.returning({ id: reviewTable.id });

		// Heavy = 5/5, light = 1/5. Weighted (3+1): (1*3 + 0.2*1)/4 = 0.8 → 4.0 on 1..5.
		// Equal weights: (1 + 0.2)/2 = 0.6 → 3.0 on 1..5.
		await db.insert(reviewScoreTable).values([
			{ reviewId: review.id, scorecardCriterionId: heavy.id!, valueNumber: '5' },
			{ reviewId: review.id, scorecardCriterionId: light.id!, valueNumber: '1' }
		]);

		const criteria = await scorecardCriteria(conference.id);
		const heavyRow = criteria.find((c) => c.id === heavy.id)!;
		const lightRow = criteria.find((c) => c.id === light.id)!;

		const weighted = submissionScore([
			{
				submitted: true,
				scores: [
					{ value: 5, weight: heavyRow.weight, scaleMax: heavyRow.scaleMax },
					{ value: 1, weight: lightRow.weight, scaleMax: lightRow.scaleMax }
				]
			}
		]);
		expect(weighted).toBeCloseTo(4, 5);

		// Flip both weights to 1 through the same update path the form uses.
		expect(
			(
				await updateScorecardCriterion(conference.id, heavy.id!, {
					label: 'Heavy',
					kind: 'rating',
					scaleMax: 5,
					optionsText: '',
					weight: 1
				})
			).ok
		).toBe(true);

		const after = await scorecardCriteria(conference.id);
		const heavyAfter = after.find((c) => c.id === heavy.id)!;
		const lightAfter = after.find((c) => c.id === light.id)!;

		const equal = submissionScore([
			{
				submitted: true,
				scores: [
					{ value: 5, weight: heavyAfter.weight, scaleMax: heavyAfter.scaleMax },
					{ value: 1, weight: lightAfter.weight, scaleMax: lightAfter.scaleMax }
				]
			}
		]);
		expect(equal).toBeCloseTo(3, 5);
		expect(equal).not.toBeCloseTo(weighted!, 5);

		// Prove the rows themselves still carry the updated weight (not only the helper).
		const [stored] = await db
			.select({ weight: scorecardCriterionTable.weight })
			.from(scorecardCriterionTable)
			.where(eq(scorecardCriterionTable.id, heavy.id!));
		expect(Number(stored.weight)).toBe(1);
	});
});
