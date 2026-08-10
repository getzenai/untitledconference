/**
 * The organizer's reading side of the CFP: the table and the detail behind a row.
 *
 * Ü2 in ROLES_AND_JOURNEYS — everything the submitter typed has to arrive here
 * complete, or the organizer retypes it. That is why the custom answers come along
 * with the built-in columns and why co-presenters are joined, not summarised.
 *
 * R6 cuts the other way in this file: the sponsor tier IS loaded here, because this
 * is the one view that must show it. Reviewer and public loaders never call these
 * functions.
 */
import { submissionScore, type ReviewScores } from '$lib/conference/scoring';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable,
	type Submission
} from '$lib/server/db/conference/cfp-schema';
import {
	sessionFormatTable,
	speakerProfileTable,
	sponsorTierTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable
} from '$lib/server/db/conference/review-schema';
import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	ilike,
	inArray,
	ne,
	notExists,
	or,
	sql
} from 'drizzle-orm';

export type SubmissionFilters = {
	q?: string;
	status?: string[];
	trackId?: number;
	sessionFormatId?: number;
};

export type SpeakerLine = {
	id: number;
	name: string;
	jobTitle: string | null;
	company: string | null;
	headshotUrl: string | null;
	isPrimary: boolean;
	roleLabel: string | null;
};

export type SubmissionRow = {
	id: number;
	title: string;
	status: Submission['status'];
	contentApproval: Submission['contentApproval'];
	submittedAt: Date | null;
	track: string | null;
	sessionFormat: string | null;
	/** INTERNAL (R6) — organizer views only. */
	sponsorTier: string | null;
	speakers: SpeakerLine[];
	score: number | null;
	reviewsSubmitted: number;
	reviewsAssigned: number;
};

/** Everything the filter bar can offer, read from the conference rather than hard-coded. */
export async function submissionFacets(conferenceId: number) {
	const [tracks, formats] = await Promise.all([
		db
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position)),
		db
			.select({ id: sessionFormatTable.id, name: sessionFormatTable.name })
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position))
	]);

	return { tracks, formats };
}

/**
 * Speakers for a set of submissions, in one query.
 *
 * The alternative — a query per row — is the classic way a table that felt instant
 * with the fixture takes four seconds with real data.
 */
async function speakersFor(submissionIds: number[]): Promise<Map<number, SpeakerLine[]>> {
	const byId = new Map<number, SpeakerLine[]>();
	if (submissionIds.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			id: speakerProfileTable.id,
			name: speakerProfileTable.name,
			jobTitle: speakerProfileTable.jobTitle,
			company: speakerProfileTable.company,
			headshotUrl: speakerProfileTable.headshotUrl,
			isPrimary: submissionSpeakerTable.isPrimary,
			roleLabel: submissionSpeakerTable.roleLabel
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, submissionIds))
		.orderBy(asc(submissionSpeakerTable.position));

	for (const { submissionId, ...speaker } of rows) {
		const list = byId.get(submissionId) ?? [];
		list.push(speaker);
		byId.set(submissionId, list);
	}

	return byId;
}

/**
 * Adds one joined score row to its review.
 *
 * The left joins produce a row with null score columns for a review nobody has filled
 * in yet — that review still counts as assigned, just not as scored, which is the
 * difference between "3/4 reviewed" and a wrong average.
 */
function pushScore(
	review: ReviewScores,
	row: { value: string | null; weight: string | null; scaleMax: number | null }
) {
	if (row.value === null || row.weight === null) return;
	review.scores.push({
		value: Number(row.value),
		weight: Number(row.weight),
		scaleMax: row.scaleMax
	});
}

/** The SQL predicate behind the filter bar. */
function submissionWhere(conferenceId: number, filters: SubmissionFilters) {
	const where = [eq(submissionTable.conferenceId, conferenceId)];

	if (filters.status?.length) {
		where.push(inArray(submissionTable.status, filters.status as Submission['status'][]));
	}
	if (filters.trackId) where.push(eq(submissionTable.trackId, filters.trackId));
	if (filters.sessionFormatId) {
		where.push(eq(submissionTable.sessionFormatId, filters.sessionFormatId));
	}
	if (filters.q?.trim()) {
		const needle = `%${filters.q.trim()}%`;
		// Title or speaker: the organizer searches for whichever one they remember.
		where.push(
			or(
				ilike(submissionTable.title, needle),
				exists(
					db
						.select({ one: sql`1` })
						.from(submissionSpeakerTable)
						.innerJoin(
							speakerProfileTable,
							eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
						)
						.where(
							and(
								eq(submissionSpeakerTable.submissionId, submissionTable.id),
								ilike(speakerProfileTable.name, needle)
							)
						)
				)
			)!
		);
	}

	return and(...where);
}

/** Review rows plus their per-criterion scores, grouped per submission. */
async function reviewsFor(conferenceId: number, submissionIds: number[]) {
	const empty = new Map<number, (ReviewScores & { id: number })[]>();
	if (submissionIds.length === 0) return empty;

	const rows = await db
		.select({
			reviewId: reviewTable.id,
			submissionId: reviewTable.submissionId,
			status: reviewTable.status,
			value: reviewScoreTable.valueNumber,
			weight: scorecardCriterionTable.weight,
			scaleMax: scorecardCriterionTable.scaleMax
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.leftJoin(reviewScoreTable, eq(reviewScoreTable.reviewId, reviewTable.id))
		.leftJoin(
			scorecardCriterionTable,
			eq(scorecardCriterionTable.id, reviewScoreTable.scorecardCriterionId)
		)
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				inArray(reviewTable.submissionId, submissionIds)
			)
		);

	const byReview = new Map<number, ReviewScores & { id: number; submissionId: number }>();
	for (const row of rows) {
		let review = byReview.get(row.reviewId);
		if (!review) {
			review = {
				id: row.reviewId,
				submissionId: row.submissionId,
				submitted: row.status === 'submitted',
				scores: []
			};
			byReview.set(row.reviewId, review);
		}
		pushScore(review, row);
	}

	const bySubmission = empty;
	for (const review of byReview.values()) {
		const list = bySubmission.get(review.submissionId) ?? [];
		list.push(review);
		bySubmission.set(review.submissionId, list);
	}

	return bySubmission;
}

/**
 * How many rows one page of the table carries.
 *
 * A cap rather than a preference: without one, the loader fans out into the speaker
 * and review queries for every submission the conference has ever had, and the screen
 * that has to stay usable at 800 submissions is the one that stops being usable first.
 */
export const PAGE_SIZE = 50;

/**
 * How the table is ordered (ABS-10).
 *
 * `newest` is what the screen has always done. The two score orders are the reason
 * this type exists: an organizer building a programme reads the pile from the top
 * score down, and reads it from the bottom up when they are looking for what to cut.
 */
export type SubmissionSort = 'newest' | 'score-desc' | 'score-asc';

export const SUBMISSION_SORTS: readonly SubmissionSort[] = ['newest', 'score-desc', 'score-asc'];

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
 * An integration test pins the two implementations against each other on the same
 * rows, so the copy cannot drift silently.
 */
function scoreExpression(conferenceId: number) {
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
 * The ORDER BY for one sort.
 *
 * `nulls last` in BOTH score directions, deliberately: an unreviewed talk has no
 * score, and "no score yet" is not "the worst one". Ascending is for finding the
 * weakest submissions, and a screen full of unscored rows would answer a different
 * question. The id is the tiebreaker everywhere, for the same reason it already is
 * on `submittedAt` — without it, two pages can show the same row twice.
 */
function orderFor(sort: SubmissionSort, conferenceId: number) {
	if (sort === 'newest') {
		return [desc(submissionTable.submittedAt), asc(submissionTable.id)];
	}

	const score = scoreExpression(conferenceId);
	return [
		sort === 'score-desc' ? sql`${score} desc nulls last` : sql`${score} asc nulls last`,
		asc(submissionTable.id)
	];
}

export type SubmissionPage = {
	rows: SubmissionRow[];
	/** How many rows the filter matches — not how many are on this page. */
	matching: number;
	/** The page actually served, which is not always the page that was asked for. */
	page: number;
	pageSize: number;
	pageCount: number;
};

export async function listSubmissions(
	conferenceId: number,
	filters: SubmissionFilters = {},
	requestedPage = 1,
	sort: SubmissionSort = 'newest'
): Promise<SubmissionPage> {
	const where = submissionWhere(conferenceId, filters);

	const [matched] = await db.select({ matching: count() }).from(submissionTable).where(where);
	const matching = Number(matched?.matching ?? 0);

	// Clamped rather than trusted: `?page=9000` is one keystroke away, and an empty
	// table under a filter that plainly matches something reads as data loss.
	const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
	const page = Math.min(Math.max(requestedPage, 1), pageCount);

	const rows = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			contentApproval: submissionTable.contentApproval,
			submittedAt: submissionTable.submittedAt,
			track: trackTable.name,
			sessionFormat: sessionFormatTable.name,
			sponsorTier: sponsorTierTable.name
		})
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		.where(where)
		// The id is not decoration: `submittedAt` is null for every draft, so without a
		// tiebreaker two pages of the same table could show the same row twice and skip
		// another one entirely. The same holds for the score, where ties are the rule
		// rather than the exception.
		.orderBy(...orderFor(sort, conferenceId))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	const ids = rows.map((r) => r.id);
	const [speakers, reviews] = await Promise.all([speakersFor(ids), reviewsFor(conferenceId, ids)]);

	return {
		rows: rows.map((row) => {
			const rowReviews = reviews.get(row.id) ?? [];
			return {
				...row,
				speakers: speakers.get(row.id) ?? [],
				score: submissionScore(rowReviews),
				reviewsSubmitted: rowReviews.filter((r) => r.submitted).length,
				reviewsAssigned: rowReviews.length
			};
		}),
		matching,
		page,
		pageSize: PAGE_SIZE,
		pageCount
	};
}

/**
 * Counts for the page header — how much work is left in the CONFERENCE.
 *
 * Deliberately not derived from the rows on screen. Counting the filtered set makes
 * the header agree with the filter and disagree with reality: search for one talk and
 * the page announces "1 total", which reads as "the pile is empty" at a glance. The
 * header answers "how much is there", the table answers "what am I looking at".
 */
export async function submissionTotals(conferenceId: number) {
	const undecided = inArray(submissionTable.status, ['submitted', 'in_review']);

	// Built with the query builder rather than as raw SQL inside the `filter`: written
	// by hand, the join conditions come out with unqualified column names and Postgres
	// rejects the statement with "column reference id is ambiguous".
	const hasNoReview = notExists(
		db
			.select({ one: sql`1` })
			.from(reviewTable)
			.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
			.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
			.where(
				and(
					eq(reviewTable.submissionId, submissionTable.id),
					eq(reviewTable.status, 'submitted'),
					eq(evaluationPlanTable.conferenceId, conferenceId)
				)
			)
	);

	const [row] = await db
		.select({
			total: count(),
			undecided: sql<number>`count(*) filter (where ${undecided})`,
			unreviewed: sql<number>`count(*) filter (where ${and(ne(submissionTable.status, 'draft'), hasNoReview)})`
		})
		.from(submissionTable)
		.where(eq(submissionTable.conferenceId, conferenceId));

	return {
		total: Number(row?.total ?? 0),
		undecided: Number(row?.undecided ?? 0),
		unreviewed: Number(row?.unreviewed ?? 0)
	};
}

export type SubmissionDetail = NonNullable<Awaited<ReturnType<typeof submissionDetail>>>;

/** The submission's own columns plus the three lookups the header shows. */
async function submissionHeader(conferenceId: number, submissionId: number) {
	const [row] = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			abstract: submissionTable.abstract,
			keyTakeaway: submissionTable.keyTakeaway,
			audienceLevel: submissionTable.audienceLevel,
			status: submissionTable.status,
			contentApproval: submissionTable.contentApproval,
			submittedAt: submissionTable.submittedAt,
			decidedAt: submissionTable.decidedAt,
			track: trackTable.name,
			sessionFormat: sessionFormatTable.name,
			sessionMinutes: sessionFormatTable.minutes,
			sponsorTier: sponsorTierTable.name,
			sponsorNote: sponsorTierTable.note
		})
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		// Scoped by conference as well as by id: an organizer of conference A must not
		// reach a submission of conference B by editing the URL.
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		)
		.limit(1);

	return row ?? null;
}

/** Ü2 — the answers to the configurable fields, in the order the form asked them. */
function answersFor(submissionId: number) {
	return db
		.select({
			label: formFieldTable.label,
			kind: formFieldTable.kind,
			value: submissionAnswerTable.value
		})
		.from(submissionAnswerTable)
		.innerJoin(formFieldTable, eq(formFieldTable.id, submissionAnswerTable.formFieldId))
		.where(eq(submissionAnswerTable.submissionId, submissionId))
		.orderBy(asc(formFieldTable.position));
}

/** One row per (review, criterion) — flat, because SQL has no other shape to offer. */
function reviewRowsFor(conferenceId: number, submissionId: number) {
	return db
		.select({
			reviewId: reviewTable.id,
			reviewerName: user.name,
			round: reviewRoundTable.name,
			anonymized: reviewRoundTable.anonymized,
			status: reviewTable.status,
			comment: reviewTable.comment,
			submittedAt: reviewTable.submittedAt,
			criterion: scorecardCriterionTable.label,
			value: reviewScoreTable.valueNumber,
			valueText: reviewScoreTable.valueText,
			weight: scorecardCriterionTable.weight,
			scaleMax: scorecardCriterionTable.scaleMax
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(user, eq(user.id, reviewTable.reviewerUserId))
		.leftJoin(reviewScoreTable, eq(reviewScoreTable.reviewId, reviewTable.id))
		.leftJoin(
			scorecardCriterionTable,
			eq(scorecardCriterionTable.id, reviewScoreTable.scorecardCriterionId)
		)
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				eq(reviewTable.submissionId, submissionId)
			)
		)
		.orderBy(asc(reviewTable.id), asc(scorecardCriterionTable.position));
}

type ReviewRow = Awaited<ReturnType<typeof reviewRowsFor>>[number];

/** Folds the flat join back into one entry per reviewer, with their own average. */
function groupReviews(rows: ReviewRow[]) {
	const byReview = new Map<number, ReturnType<typeof emptyReview>>();

	for (const r of rows) {
		let review = byReview.get(r.reviewId);
		if (!review) {
			review = emptyReview(r);
			byReview.set(r.reviewId, review);
		}
		if (r.criterion) {
			review.scores.push({
				criterion: r.criterion,
				value: r.value === null ? null : Number(r.value),
				valueText: r.valueText,
				weight: r.weight === null ? 1 : Number(r.weight),
				scaleMax: r.scaleMax
			});
		}
	}

	return [...byReview.values()].map((review) => ({
		...review,
		// The same weighting the table's aggregate uses — a reviewer's own average must
		// not be computed by a second rule, or the two numbers disagree on one screen.
		score: submissionScore([{ submitted: review.status === 'submitted', scores: review.scores }])
	}));
}

function emptyReview(r: ReviewRow) {
	return {
		id: r.reviewId,
		// ABS-07: the round can hide the reviewer's identity from their peers. The
		// organizer still needs to know who has and has not answered, so anonymisation
		// labels the row rather than dropping it.
		reviewerName: r.anonymized ? `Reviewer ${r.reviewId}` : (r.reviewerName ?? 'Reviewer'),
		round: r.round,
		status: r.status,
		comment: r.comment,
		submittedAt: r.submittedAt,
		scores: [] as {
			criterion: string;
			value: number | null;
			valueText: string | null;
			weight: number;
			scaleMax: number | null;
		}[]
	};
}

/**
 * One submission with everything the decision needs on a single screen (Ü4):
 * the abstract, the custom answers, every review, and whether it is already in the
 * programme.
 */
export async function submissionDetail(conferenceId: number, submissionId: number) {
	const row = await submissionHeader(conferenceId, submissionId);
	if (!row) return null;

	const [speakers, answers, reviewRows, placements] = await Promise.all([
		speakersFor([submissionId]),
		answersFor(submissionId),
		reviewRowsFor(conferenceId, submissionId),
		db
			.select({
				id: placementTable.id,
				status: placementTable.status,
				recordingUrl: placementTable.recordingUrl
			})
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId))
	]);

	const reviews = groupReviews(reviewRows);

	return {
		...row,
		speakers: speakers.get(submissionId) ?? [],
		answers,
		reviews,
		score: submissionScore(
			reviews.map((r) => ({ submitted: r.status === 'submitted', scores: r.scores }))
		),
		/** Ü6: is this talk already sitting in the agenda, and how firmly? */
		placements
	};
}
