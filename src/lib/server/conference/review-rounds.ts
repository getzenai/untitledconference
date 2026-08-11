/**
 * The review rounds an organizer evaluates submissions in.
 *
 * Everything downstream of a round has been in the product all along — the
 * assignment matrix (`review-management.ts`), the reviewer's queue and scoring
 * view (`reviewer.ts`), and the anonymised reading of a submission that
 * `anonymized` switches on. What was missing is the round itself. The demo seed
 * writes `review_round` directly (`scripts/db/seed-devflow.mjs`), so the seeded
 * conference could be reviewed end to end; a conference an organizer made
 * themselves could not, because the submission detail's instruction to "create a
 * review round before assigning submissions" pointed at a thing no screen could
 * do. Assignment, scoring and blinding were all unreachable behind that gap.
 *
 * `evaluation_plan` sits between conference and round in the schema. Organizers
 * are not asked about it: a conference gets one plan, created the first time a
 * round is added, because a level nobody can put a second row in is a level
 * nobody should have to name.
 *
 * Scoped to one conference in the query itself, like `task-templates.ts` — a
 * round id arriving from a form is never trusted on its own.
 */
import { db } from '$lib/server/db';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, asc, count, eq, sql } from 'drizzle-orm';

export type ReviewRound = {
	id: number;
	name: string;
	anonymized: boolean;
	position: number;
	/** Assignments written against this round, for the "is anyone working?" line. */
	assignments: number;
	/** How many of those are filed. */
	completed: number;
};

export type RoundInput = {
	name: string;
	anonymized: boolean;
};

/** What went wrong, in the words the form prints. `null` means it is fine. */
export type RoundProblem = string | null;

const MAX_NAME = 120;
/** Past this it is a mistake, not an evaluation plan. */
const MAX_ROUNDS = 20;

const DEFAULT_PLAN_NAME = 'Review plan';

export async function reviewRounds(conferenceId: number): Promise<ReviewRound[]> {
	return db
		.select({
			id: reviewRoundTable.id,
			name: reviewRoundTable.name,
			anonymized: reviewRoundTable.anonymized,
			position: reviewRoundTable.position,
			assignments: count(reviewTable.id),
			completed: sql<number>`count(*) filter (where ${reviewTable.status} = 'submitted')::int`
		})
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.leftJoin(reviewTable, eq(reviewTable.reviewRoundId, reviewRoundTable.id))
		.where(eq(evaluationPlanTable.conferenceId, conferenceId))
		.groupBy(reviewRoundTable.id)
		.orderBy(asc(reviewRoundTable.position), asc(reviewRoundTable.id));
}

export function roundProblem(input: RoundInput): RoundProblem {
	if (!input.name.trim()) return 'Give the round a name.';
	if (input.name.trim().length > MAX_NAME) return `Keep the name under ${MAX_NAME} characters.`;
	return null;
}

/**
 * Adds a round, creating the conference's evaluation plan if this is the first.
 *
 * One transaction: a plan with no round is a row an organizer can neither see nor
 * use, and it would silently become the plan every later round hangs off.
 */
export async function addReviewRound(
	conferenceId: number,
	input: RoundInput
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
	const problem = roundProblem(input);
	if (problem) return { ok: false, message: problem };

	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: evaluationPlanTable.id })
			.from(evaluationPlanTable)
			.where(eq(evaluationPlanTable.conferenceId, conferenceId))
			.orderBy(asc(evaluationPlanTable.id))
			.limit(1);

		const planId =
			existing?.id ??
			(
				await tx
					.insert(evaluationPlanTable)
					.values({ conferenceId, name: DEFAULT_PLAN_NAME })
					.returning({ id: evaluationPlanTable.id })
			)[0].id;

		const [{ total }] = await tx
			.select({ total: count() })
			.from(reviewRoundTable)
			.where(eq(reviewRoundTable.evaluationPlanId, planId));

		if (total >= MAX_ROUNDS) {
			return { ok: false as const, message: `A conference tops out at ${MAX_ROUNDS} rounds.` };
		}

		const [created] = await tx
			.insert(reviewRoundTable)
			.values({
				evaluationPlanId: planId,
				name: input.name.trim().slice(0, MAX_NAME),
				anonymized: input.anonymized,
				position: total
			})
			.returning({ id: reviewRoundTable.id });

		return { ok: true as const, id: created.id };
	});
}

/**
 * Removes a round, but only while nothing has been assigned in it.
 *
 * Deleting a round cascades to its reviews, so a round that reviewers have
 * already worked in cannot be undone by a stray click — that is a decision about
 * their work, not about a row.
 */
export async function deleteReviewRound(
	conferenceId: number,
	roundId: number
): Promise<{ ok: true } | { ok: false; message: string }> {
	const [round] = await db
		.select({ id: reviewRoundTable.id })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(eq(reviewRoundTable.id, roundId), eq(evaluationPlanTable.conferenceId, conferenceId))
		)
		.limit(1);

	if (!round) return { ok: false, message: 'No such round.' };

	const [{ total }] = await db
		.select({ total: count() })
		.from(reviewTable)
		.where(eq(reviewTable.reviewRoundId, roundId));

	if (total > 0) {
		return { ok: false, message: 'This round already has assignments. Unassign them first.' };
	}

	await db.delete(reviewRoundTable).where(eq(reviewRoundTable.id, roundId));
	return { ok: true };
}
