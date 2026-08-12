/**
 * Scorecard criteria an organizer builds for a review round (ABS-03, ABS-04).
 *
 * The weighted aggregate (`scoring.ts`) and the reviewer form already honour
 * `kind`, `scaleMax`, `options` and `weight`. What was missing is the window that
 * writes those rows — without it every conference inherits seed criteria (or none)
 * and ABS-04 fails because nobody can type a weight other than 1.
 *
 * Every write joins the round through its evaluation plan onto the conference, so
 * a form-supplied criterion id or round id from another conference selects nothing.
 */
import {
	parseCriterion,
	type CriterionInput,
	type CriterionKind
} from '$lib/conference/scorecard-criterion';
import { db } from '$lib/server/db';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { and, asc, count, eq, sql } from 'drizzle-orm';

export { parseCriterion };
export type { CriterionInput, CriterionKind };

export type ScorecardCriterion = {
	id: number;
	reviewRoundId: number;
	label: string;
	kind: CriterionKind;
	scaleMax: number | null;
	/** Parsed option list for `select`; empty for other kinds. */
	options: string[];
	weight: number;
	position: number;
	/** How many filled-in scores hang on this row — blocks delete when > 0. */
	scoreCount: number;
};

export type CriterionResult = { ok: true; id?: number } | { ok: false; message: string };

const MAX_CRITERIA_PER_ROUND = 40;

function parseStoredOptions(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === 'string');
	} catch {
		return [];
	}
}

/** All criteria for every round of a conference, ordered for the rounds page. */
export async function scorecardCriteria(conferenceId: number): Promise<ScorecardCriterion[]> {
	const rows = await db
		.select({
			id: scorecardCriterionTable.id,
			reviewRoundId: scorecardCriterionTable.reviewRoundId,
			label: scorecardCriterionTable.label,
			kind: scorecardCriterionTable.kind,
			scaleMax: scorecardCriterionTable.scaleMax,
			options: scorecardCriterionTable.options,
			weight: scorecardCriterionTable.weight,
			position: scorecardCriterionTable.position,
			scoreCount: count(reviewScoreTable.id)
		})
		.from(scorecardCriterionTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, scorecardCriterionTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.leftJoin(
			reviewScoreTable,
			eq(reviewScoreTable.scorecardCriterionId, scorecardCriterionTable.id)
		)
		.where(eq(evaluationPlanTable.conferenceId, conferenceId))
		.groupBy(scorecardCriterionTable.id)
		.orderBy(
			asc(scorecardCriterionTable.reviewRoundId),
			asc(scorecardCriterionTable.position),
			asc(scorecardCriterionTable.id)
		);

	return rows.map((row) => ({
		id: row.id,
		reviewRoundId: row.reviewRoundId,
		label: row.label,
		kind: row.kind,
		scaleMax: row.scaleMax,
		options: parseStoredOptions(row.options),
		weight: Number(row.weight),
		position: row.position,
		scoreCount: Number(row.scoreCount)
	}));
}

/** The round belongs to this conference — or it does not exist for this write. */
async function ownedRound(conferenceId: number, roundId: number) {
	const [round] = await db
		.select({ id: reviewRoundTable.id })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(eq(reviewRoundTable.id, roundId), eq(evaluationPlanTable.conferenceId, conferenceId))
		)
		.limit(1);
	return round ?? null;
}

async function ownedCriterion(conferenceId: number, criterionId: number) {
	const [row] = await db
		.select({
			id: scorecardCriterionTable.id,
			reviewRoundId: scorecardCriterionTable.reviewRoundId,
			kind: scorecardCriterionTable.kind,
			scaleMax: scorecardCriterionTable.scaleMax
		})
		.from(scorecardCriterionTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, scorecardCriterionTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				eq(scorecardCriterionTable.id, criterionId),
				eq(evaluationPlanTable.conferenceId, conferenceId)
			)
		)
		.limit(1);
	return row ?? null;
}

async function hangingScoreCount(criterionId: number): Promise<number> {
	const [{ total }] = await db
		.select({ total: count() })
		.from(reviewScoreTable)
		.where(eq(reviewScoreTable.scorecardCriterionId, criterionId));
	return total;
}

function scoreHangMessage(action: string, total: number): string {
	const noun = total === 1 ? 'review score' : 'review scores';
	return `Cannot ${action} — ${total} ${noun} hang on this criterion.`;
}

export async function addScorecardCriterion(
	conferenceId: number,
	roundId: number,
	input: CriterionInput
): Promise<CriterionResult> {
	const parsed = parseCriterion(input);
	if (!parsed.ok) return parsed;

	const round = await ownedRound(conferenceId, roundId);
	if (!round) return { ok: false, message: 'No such round.' };

	const [{ total }] = await db
		.select({ total: count() })
		.from(scorecardCriterionTable)
		.where(eq(scorecardCriterionTable.reviewRoundId, roundId));

	if (total >= MAX_CRITERIA_PER_ROUND) {
		return {
			ok: false,
			message: `A round tops out at ${MAX_CRITERIA_PER_ROUND} criteria.`
		};
	}

	const [{ next }] = await db
		.select({
			next: sql<number>`coalesce(max(${scorecardCriterionTable.position}), -1) + 1`
		})
		.from(scorecardCriterionTable)
		.where(eq(scorecardCriterionTable.reviewRoundId, roundId));

	const [created] = await db
		.insert(scorecardCriterionTable)
		.values({
			reviewRoundId: roundId,
			...parsed.values,
			position: next
		})
		.returning({ id: scorecardCriterionTable.id });

	return { ok: true, id: created.id };
}

/**
 * Updates a criterion. Label and weight stay free while scores hang (weight is
 * meant to re-rank after the fact — ABS-04). Kind changes and a shrinking
 * scaleMax are refused: the first zeros the aggregate silently, the second lets
 * a stored value overshoot the new maximum.
 */
export async function updateScorecardCriterion(
	conferenceId: number,
	criterionId: number,
	input: CriterionInput
): Promise<CriterionResult> {
	const parsed = parseCriterion(input);
	if (!parsed.ok) return parsed;

	const owned = await ownedCriterion(conferenceId, criterionId);
	if (!owned) return { ok: false, message: 'No such criterion.' };

	const hanging = await hangingScoreCount(criterionId);
	if (hanging > 0) {
		if (parsed.values.kind !== owned.kind) {
			return { ok: false, message: scoreHangMessage('change type', hanging) };
		}
		if (
			owned.scaleMax != null &&
			parsed.values.scaleMax != null &&
			parsed.values.scaleMax < owned.scaleMax
		) {
			return { ok: false, message: scoreHangMessage('shrink the scale', hanging) };
		}
	}

	await db
		.update(scorecardCriterionTable)
		.set(parsed.values)
		.where(eq(scorecardCriterionTable.id, criterionId));

	return { ok: true, id: criterionId };
}

/**
 * Removes a criterion only while no review scores hang on it.
 *
 * `review_score.scorecard_criterion_id` cascades on delete — a free click would
 * silently throw away every rating reviewers already filed. Block with a count.
 */
export async function deleteScorecardCriterion(
	conferenceId: number,
	criterionId: number
): Promise<CriterionResult> {
	const owned = await ownedCriterion(conferenceId, criterionId);
	if (!owned) return { ok: false, message: 'No such criterion.' };

	const total = await hangingScoreCount(criterionId);
	if (total > 0) {
		return { ok: false, message: scoreHangMessage('delete', total) };
	}

	await db.delete(scorecardCriterionTable).where(eq(scorecardCriterionTable.id, criterionId));
	return { ok: true };
}

/**
 * Swap positions with the neighbour above or below in the same round.
 * Position is what the reviewer form orders by.
 */
export async function moveScorecardCriterion(
	conferenceId: number,
	criterionId: number,
	direction: 'up' | 'down'
): Promise<CriterionResult> {
	const owned = await ownedCriterion(conferenceId, criterionId);
	if (!owned) return { ok: false, message: 'No such criterion.' };

	const siblings = await db
		.select({
			id: scorecardCriterionTable.id,
			position: scorecardCriterionTable.position
		})
		.from(scorecardCriterionTable)
		.where(eq(scorecardCriterionTable.reviewRoundId, owned.reviewRoundId))
		.orderBy(asc(scorecardCriterionTable.position), asc(scorecardCriterionTable.id));

	const index = siblings.findIndex((row) => row.id === criterionId);
	if (index < 0) return { ok: false, message: 'No such criterion.' };

	const swapWith = direction === 'up' ? index - 1 : index + 1;
	if (swapWith < 0 || swapWith >= siblings.length) {
		return { ok: true, id: criterionId };
	}

	const reordered = [...siblings];
	[reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

	// Rewrite the whole ladder so shared/legacy positions cannot leave two rows tied.
	await db.transaction(async (tx) => {
		for (let i = 0; i < reordered.length; i++) {
			await tx
				.update(scorecardCriterionTable)
				.set({ position: i })
				.where(eq(scorecardCriterionTable.id, reordered[i].id));
		}
	});

	return { ok: true, id: criterionId };
}
