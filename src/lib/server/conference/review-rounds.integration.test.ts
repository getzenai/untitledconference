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
import {
	addReviewRound,
	deleteReviewRound,
	renameReviewRound,
	reviewRounds,
	type RoundInput
} from './review-rounds';

/** A round with no window, which is the shape most of these cases are about. */
const roundInput = (name: string, extra: Partial<RoundInput> = {}): RoundInput => ({
	name,
	anonymized: false,
	opensAt: null,
	closesAt: null,
	...extra
});

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
		const first = await addReviewRound(conference.id, roundInput('Screening'));
		expect(first.ok).toBe(true);

		const second = await addReviewRound(
			conference.id,
			roundInput('Programme', { anonymized: true })
		);
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
		const result = await addReviewRound(conference.id, roundInput('   '));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toMatch(/name/i);
	});

	it('stores the round’s window and reads it back', async () => {
		const opensAt = new Date('2027-02-01T09:00:00.000Z');
		const closesAt = new Date('2027-03-01T22:59:00.000Z');
		const created = await addReviewRound(
			conference.id,
			roundInput('Dated round', { opensAt, closesAt })
		);
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round?.opensAt?.toISOString()).toBe(opensAt.toISOString());
		expect(round?.closesAt?.toISOString()).toBe(closesAt.toISOString());
	});

	it('keeps a round with only one end of the window', async () => {
		const closesAt = new Date('2027-04-01T22:59:00.000Z');
		const created = await addReviewRound(conference.id, roundInput('Closes only', { closesAt }));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round?.opensAt).toBeNull();
		expect(round?.closesAt?.toISOString()).toBe(closesAt.toISOString());
	});

	it('refuses a window that closes before it opens', async () => {
		const result = await addReviewRound(
			conference.id,
			roundInput('Backwards', {
				opensAt: new Date('2027-03-01T09:00:00.000Z'),
				closesAt: new Date('2027-02-01T09:00:00.000Z')
			})
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toMatch(/close/i);
		expect((await reviewRounds(conference.id)).map((r) => r.name)).not.toContain('Backwards');
	});

	it('keeps one conference’s rounds out of another’s list', async () => {
		await addReviewRound(otherConference.id, roundInput('Elsewhere'));

		expect((await reviewRounds(conference.id)).map((r) => r.name)).not.toContain('Elsewhere');
		expect((await reviewRounds(otherConference.id)).map((r) => r.name)).toEqual(['Elsewhere']);
	});
});

describe('reviewRounds counts', () => {
	it('reports assignments and how many are filed', async () => {
		const created = await addReviewRound(conference.id, roundInput('Counted'));
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
		const created = await addReviewRound(conference.id, roundInput('Empty'));
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
		const created = await addReviewRound(conference.id, roundInput('Throwaway'));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		expect(await deleteReviewRound(conference.id, created.id)).toEqual({ ok: true });
		expect((await reviewRounds(conference.id)).map((r) => r.id)).not.toContain(created.id);
	});

	it('refuses to delete a round that already carries assignments', async () => {
		const created = await addReviewRound(conference.id, roundInput('In use'));
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
		const mine = await addReviewRound(otherConference.id, roundInput('Not yours'));
		expect(mine.ok).toBe(true);
		if (!mine.ok) return;

		const result = await deleteReviewRound(conference.id, mine.id);
		expect(result.ok).toBe(false);
		expect((await reviewRounds(otherConference.id)).map((r) => r.id)).toContain(mine.id);
	});
});

/**
 * A round used to be write-once: created from a form and, if the name was wrong,
 * wrong for good — while the name is what reviewers navigate by and what the
 * queue prints beside a talk held in two rounds.
 */
describe('renameReviewRound', () => {
	it('renames a round and keeps its assignments', async () => {
		const created = await addReviewRound(conference.id, roundInput('Rond 1'));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const [submission] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Renamed round talk', status: 'submitted' })
			.returning({ id: submissionTable.id });
		await db.insert(reviewTable).values({
			reviewRoundId: created.id,
			submissionId: submission.id,
			reviewerUserId: reviewerId,
			status: 'assigned'
		});

		expect(await renameReviewRound(conference.id, created.id, roundInput('Round 1'))).toEqual({
			ok: true
		});

		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round?.name).toBe('Round 1');
		// The distinction from remove-and-re-add, which refuses here for this reason.
		expect(round?.assignments).toBe(1);
	});

	it('saves a window onto an existing round and clears it again', async () => {
		const created = await addReviewRound(conference.id, roundInput('Undated'));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const closesAt = new Date('2027-05-01T22:59:00.000Z');
		expect(
			await renameReviewRound(conference.id, created.id, roundInput('Undated', { closesAt }))
		).toEqual({ ok: true });
		expect(
			(await reviewRounds(conference.id)).find((r) => r.id === created.id)?.closesAt?.toISOString()
		).toBe(closesAt.toISOString());

		// Clearing the picker has to reach the column: a date nobody can remove is
		// worse than one nobody set.
		expect(await renameReviewRound(conference.id, created.id, roundInput('Undated'))).toEqual({
			ok: true
		});
		expect(
			(await reviewRounds(conference.id)).find((r) => r.id === created.id)?.closesAt
		).toBeNull();
	});

	it('changes whether the round hides reviewers, including on reviews already filed', async () => {
		const created = await addReviewRound(conference.id, roundInput('Open round'));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		expect(
			await renameReviewRound(
				conference.id,
				created.id,
				roundInput('Blind round', { anonymized: true })
			)
		).toEqual({ ok: true });

		const round = (await reviewRounds(conference.id)).find((r) => r.id === created.id);
		expect(round?.anonymized).toBe(true);
	});

	it('refuses an empty name rather than storing one', async () => {
		const created = await addReviewRound(conference.id, roundInput('Keeps its name'));
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const result = await renameReviewRound(conference.id, created.id, roundInput('   '));

		expect(result.ok).toBe(false);
		expect((await reviewRounds(conference.id)).find((r) => r.id === created.id)?.name).toBe(
			'Keeps its name'
		);
	});

	it('refuses a round id from another conference', async () => {
		const theirs = await addReviewRound(otherConference.id, roundInput('Theirs'));
		expect(theirs.ok).toBe(true);
		if (!theirs.ok) return;

		const result = await renameReviewRound(
			conference.id,
			theirs.id,
			roundInput('Renamed by a stranger', { anonymized: true })
		);

		expect(result.ok).toBe(false);
		const untouched = (await reviewRounds(otherConference.id)).find((r) => r.id === theirs.id);
		expect(untouched?.name).toBe('Theirs');
		expect(untouched?.anonymized).toBe(false);
	});
});
