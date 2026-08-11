/**
 * How the organizer's results table is ordered, and the SQL that makes it possible.
 *
 * Its own module because the ordering has two readers — the paged table and the CSV
 * export (ABS-13) — and because the scoring SQL below is the one piece of this
 * feature that is worth reading on its own.
 */
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import { asc, desc, sql } from 'drizzle-orm';

/**
 * How the table is ordered (ABS-10).
 *
 * `newest` is what the screen has always done. The two score orders are the reason
 * this type exists: an organizer building a programme reads the pile from the top
 * score down, and reads it from the bottom up when they are looking for what to cut.
 *
 * The review counts (#122) answer a different question, and it is the one asked in
 * the user interview: not "which talk is best" but "where is the review work". Its
 * useful direction is ascending — the talks nobody has reviewed float to the top.
 */
export type SubmissionSort =
	| 'newest'
	| 'score-desc'
	| 'score-asc'
	| 'title-asc'
	| 'title-desc'
	| 'reviews-asc'
	| 'reviews-desc';

export const SUBMISSION_SORTS: readonly SubmissionSort[] = [
	'newest',
	'score-desc',
	'score-asc',
	'title-asc',
	'title-desc',
	'reviews-asc',
	'reviews-desc'
];

export function parseSort(raw: string | null | undefined): SubmissionSort {
	return SUBMISSION_SORTS.includes(raw as SubmissionSort) ? (raw as SubmissionSort) : 'newest';
}

/**
 * The submission's aggregate score, computed in SQL.
 *
 * This is `submissionScore` from `$lib/conference/scoring` written a second time in
 * another language, which is a cost worth naming: the alternative is sorting the 50
 * rows of the current page, and a "sort by score" that only orders the page is not a
 * sort — it is a lie that looks right until page two. The ordering has to happen
 * before `LIMIT`, so it has to happen in the database.
 *
 * The arithmetic mirrors the TypeScript exactly: normalise each criterion by its own
 * `scale_max`, take the criterion-weighted mean per review, take the plain mean over
 * reviewers (people count equally, criteria do not), then scale to 1..5. Blanks and
 * unusable criteria are dropped rather than counted as zero, and a review whose
 * scores are all blank contributes nothing — it does not drag the mean down.
 *
 * An integration test selects this expression itself and pins it against
 * `submissionScore` on the same rows, so the copy cannot drift silently. Exported for
 * exactly that: asserting the resulting ORDER alone is too weak a net — drop the
 * weights here and a two-row ordering test stays green while every number is wrong.
 */
export function scoreExpression(conferenceId: number) {
	return sql<number | null>`(
		select avg(per_review.value) * 5
		from (
			select
				sum((${reviewScoreTable.valueNumber} / ${scorecardCriterionTable.scaleMax}) * ${scorecardCriterionTable.weight})
					/ nullif(sum(${scorecardCriterionTable.weight}), 0) as value
			from ${reviewTable}
			inner join ${reviewRoundTable}
				on ${reviewRoundTable.id} = ${reviewTable.reviewRoundId}
			inner join ${evaluationPlanTable}
				on ${evaluationPlanTable.id} = ${reviewRoundTable.evaluationPlanId}
			inner join ${reviewScoreTable}
				on ${reviewScoreTable.reviewId} = ${reviewTable.id}
			inner join ${scorecardCriterionTable}
				on ${scorecardCriterionTable.id} = ${reviewScoreTable.scorecardCriterionId}
			where ${reviewTable.submissionId} = ${submissionTable.id}
				and ${reviewTable.status} = 'submitted'
				and ${evaluationPlanTable.conferenceId} = ${conferenceId}
				and ${reviewScoreTable.valueNumber} is not null
				and ${scorecardCriterionTable.scaleMax} > 0
				and ${scorecardCriterionTable.weight} > 0
			group by ${reviewTable.id}
		) per_review
	)`;
}

/**
 * How many reviews of this submission have actually been handed in (#122).
 *
 * `submitted` only. An assignment nobody has answered is work outstanding, not a
 * review that exists — counting it would put a talk three reviewers are sitting on
 * level with one that is genuinely done, which is the opposite of what the column
 * is for.
 *
 * Scoped through round → plan → conference like every other read of `review` here:
 * the same submission id cannot appear under another conference's plan, but the
 * join is what says so rather than the caller.
 *
 * One definition, two readers: this expression orders the table, and
 * `organizer-submissions` builds the "still to review" filter and the header's
 * unreviewed count out of the same SQL. A filter that disagreed with the number
 * printed above it would be worse than no filter.
 */
export function submittedReviewCount(conferenceId: number) {
	return sql<number>`(
		select count(*)
		from ${reviewTable}
		inner join ${reviewRoundTable}
			on ${reviewRoundTable.id} = ${reviewTable.reviewRoundId}
		inner join ${evaluationPlanTable}
			on ${evaluationPlanTable.id} = ${reviewRoundTable.evaluationPlanId}
		where ${reviewTable.submissionId} = ${submissionTable.id}
			and ${reviewTable.status} = 'submitted'
			and ${evaluationPlanTable.conferenceId} = ${conferenceId}
	)`;
}

/**
 * The ORDER BY for one sort.
 *
 * `nulls last` in BOTH score directions, deliberately: an unreviewed talk has no
 * score, and "no score yet" is not "the worst one". Ascending is for finding the
 * weakest submissions, and a screen full of unscored rows would answer a different
 * question. The id is the tiebreaker everywhere, for the same reason it already is
 * on `submittedAt` — without it, two pages can show the same row twice.
 */
export function orderFor(sort: SubmissionSort, conferenceId: number) {
	if (sort === 'newest') {
		return [desc(submissionTable.submittedAt), asc(submissionTable.id)];
	}

	// `lower(...)`, not the raw column, so the alphabet does not depend on the
	// database's collation: our databases run `en_US.utf8`, which already ignores
	// case, but a C-collated one sorts "Zebra" ahead of "apple" and would put every
	// capitalised title in a block of its own. That makes this line defensive rather
	// than load-bearing today — worth knowing, because the ordering test passes with
	// it removed on the collation CI actually runs.
	//
	// In SQL rather than after `LIMIT`, for the same reason the score sort is: an
	// ordering applied to the current page only is not an ordering.
	if (sort === 'title-asc' || sort === 'title-desc') {
		const title = sql`lower(${submissionTable.title})`;
		return [sort === 'title-asc' ? sql`${title} asc` : sql`${title} desc`, asc(submissionTable.id)];
	}

	// No `nulls last` here, and none is needed: a submission nobody has reviewed
	// counts zero rather than null, and zero is exactly where it belongs at the top
	// of the ascending order. That is the difference between this column and the
	// score — "no score yet" is not the worst score, but "no reviews yet" IS the
	// least reviewed.
	if (sort === 'reviews-asc' || sort === 'reviews-desc') {
		const reviews = submittedReviewCount(conferenceId);
		return [
			sort === 'reviews-asc' ? sql`${reviews} asc` : sql`${reviews} desc`,
			asc(submissionTable.id)
		];
	}

	const score = scoreExpression(conferenceId);
	return [
		sort === 'score-desc' ? sql`${score} desc nulls last` : sql`${score} asc nulls last`,
		asc(submissionTable.id)
	];
}
