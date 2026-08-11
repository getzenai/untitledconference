/**
 * Creating and listing review rounds.
 *
 * The assertions that matter are the ones a reading of the code does not settle:
 * that the first round brings its evaluation plan with it and the second reuses
 * it, that a round carrying reviewers' work cannot be deleted out from under
 * them, and that one conference's rounds never appear under another's — the plan
 * sits between conference and round, so the tenancy check has a join in it and a
 * join is exactly where scoping goes missing.
 *
 * Hermetic — the fixture states its own preconditions rather than leaning on the
 * demo seed.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { evaluationPlanTable, reviewTable } from '$lib/server/db/conference/review-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addReviewRound, deleteReviewRound, reviewRounds } from './review-rounds';

const suffix = `rounds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const reviewerId = `reviewer-${suffix}`;

let conference: Conference;
let otherConference: Conference;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Rounds Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values({
		id: reviewerId,
		email: `${reviewerId}@example.test`,
		emailVerified: true,
		name: 'Rex Reviewer'
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Rounds Conf', slug: suffix })
		.returning();
	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Other Conf', slug: `${suffix}-other` })
		.returning();
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, reviewerId));
});

describe('addReviewRound', () => {
	it('creates the conference evaluation plan with the first round and reuses it after', async () => {
		const first = await addReviewRound(conference.id, { name: 'Screening', anonymized: false });
		expect(first.ok).toBe(true);

		const second = await addReviewRound(conference.id, { name: 'Programme', anonymized: true });
		expect(second.ok).toBe(true);

		const plans = await db
			.select({ id: evaluationPlanTable.id })
			.from(evaluationPlanTable)
			.where(eq(evaluationPlanTable.conferenceId, conference.id));
		expect(plans).toHaveLength(1);

		const rounds = await reviewRounds(conference.id);
		expect(rounds.map((r) => r.name)).toEqual(['Screening', 'Programme']);
		// Position is what the assignment matrix orders by, so the second round must
		// not land on top of the first.
		expect(rounds.map((r) => r.position)).toEqual([0, 1]);
		expect(rounds[1].anonymized).toBe(true);
	});

	it('refuses a nameless round', async () => {
		const result = await addReviewRound(conference.id, { name: '   ', anonymized: false });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toMatch(/name/i);
	});

	it('keeps one conference’s rounds out of another’s list', async () => {
		await addReviewRound(otherConference.id, { name: 'Elsewhere', anonymized: false });

		expect((await reviewRounds(conference.id)).map((r) => r.name)).not.toContain('Elsewhere');
		expect((await reviewRounds(otherConference.id)).map((r) => r.name)).toEqual(['Elsewhere']);
	});
});

describe('reviewRounds counts', () => {
	it('reports assignments and how many are filed', async () => {
		const created = await addReviewRound(conference.id, { name: 'Counted', anonymized: false });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Counted talk', status: 'submitted' })
			.returning({ id: submissionTable.id });

		await db.insert(reviewTable).values([
			{
				reviewRoundId: created.id,
				submissionId: submission.id,
				reviewerUserId: reviewerId,
				status: 'assigned'
			}
		]);

		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round).toMatchObject({ assignments: 1, completed: 0 });

		await db
			.update(reviewTable)
			.set({ status: 'submitted' })
			.where(eq(reviewTable.reviewRoundId, created.id));

		const after = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(after).toMatchObject({ assignments: 1, completed: 1 });
	});

	it('reports a fresh round as empty rather than omitting it', async () => {
		const created = await addReviewRound(conference.id, { name: 'Empty', anonymized: false });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		// The left join must not drop a round nobody is assigned to — that round is
		// exactly the one an organizer has just made and needs to see.
		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round).toMatchObject({ assignments: 0, completed: 0 });
	});
});

describe('deleteReviewRound', () => {
	it('removes a round nobody has been assigned in', async () => {
		const created = await addReviewRound(conference.id, { name: 'Throwaway', anonymized: false });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		expect(await deleteReviewRound(conference.id, created.id)).toEqual({ ok: true });
		expect((await reviewRounds(conference.id)).map((r) => r.id)).not.toContain(created.id);
	});

	it('refuses to delete a round that already carries assignments', async () => {
		const created = await addReviewRound(conference.id, { name: 'In use', anonymized: false });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'In-use talk', status: 'submitted' })
			.returning({ id: submissionTable.id });
		await db.insert(reviewTable).values({
			reviewRoundId: created.id,
			submissionId: submission.id,
			reviewerUserId: reviewerId,
			status: 'assigned'
		});

		const result = await deleteReviewRound(conference.id, created.id);
		expect(result.ok).toBe(false);
		expect((await reviewRounds(conference.id)).map((r) => r.id)).toContain(created.id);
	});

	it('refuses a round id from another conference', async () => {
		const mine = await addReviewRound(otherConference.id, { name: 'Not yours', anonymized: false });
		expect(mine.ok).toBe(true);
		if (!mine.ok) return;

		const result = await deleteReviewRound(conference.id, mine.id);
		expect(result.ok).toBe(false);
		expect((await reviewRounds(otherConference.id)).map((r) => r.id)).toContain(mine.id);
	});
});
