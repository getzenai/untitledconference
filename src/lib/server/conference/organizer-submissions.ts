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
import { and, asc, desc, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm';

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
		// The left joins produce one row with null score columns for a review nobody
		// has filled in yet. That review still counts as assigned, just not as scored.
		if (row.value !== null && row.weight !== null) {
			review.scores.push({
				value: Number(row.value),
				weight: Number(row.weight),
				scaleMax: row.scaleMax
			});
		}
	}

	const bySubmission = empty;
	for (const review of byReview.values()) {
		const list = bySubmission.get(review.submissionId) ?? [];
		list.push(review);
		bySubmission.set(review.submissionId, list);
	}

	return bySubmission;
}

export async function listSubmissions(
	conferenceId: number,
	filters: SubmissionFilters = {}
): Promise<SubmissionRow[]> {
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
		.where(and(...where))
		.orderBy(desc(submissionTable.submittedAt), asc(submissionTable.id));

	const ids = rows.map((r) => r.id);
	const [speakers, reviews] = await Promise.all([speakersFor(ids), reviewsFor(conferenceId, ids)]);

	return rows.map((row) => {
		const rowReviews = reviews.get(row.id) ?? [];
		return {
			...row,
			speakers: speakers.get(row.id) ?? [],
			score: submissionScore(rowReviews),
			reviewsSubmitted: rowReviews.filter((r) => r.submitted).length,
			reviewsAssigned: rowReviews.length
		};
	});
}

/** Counts for the page header — the two numbers that say how much work is left. */
export function submissionCounts(rows: SubmissionRow[]) {
	return {
		total: rows.length,
		undecided: rows.filter((r) => r.status === 'submitted' || r.status === 'in_review').length,
		unreviewed: rows.filter((r) => r.reviewsSubmitted === 0 && r.status !== 'draft').length
	};
}

export type SubmissionDetail = NonNullable<Awaited<ReturnType<typeof submissionDetail>>>;

/**
 * One submission with everything the decision needs on a single screen (Ü4).
 *
 * Scoped by `conferenceId` as well as by id: an organizer of conference A must not
 * reach a submission of conference B by editing the URL.
 */
export async function submissionDetail(conferenceId: number, submissionId: number) {
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
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		)
		.limit(1);

	if (!row) return null;

	const [speakers, answers, reviewRows, placements] = await Promise.all([
		speakersFor([submissionId]),
		db
			.select({
				label: formFieldTable.label,
				kind: formFieldTable.kind,
				value: submissionAnswerTable.value
			})
			.from(submissionAnswerTable)
			.innerJoin(formFieldTable, eq(formFieldTable.id, submissionAnswerTable.formFieldId))
			.where(eq(submissionAnswerTable.submissionId, submissionId))
			.orderBy(asc(formFieldTable.position)),
		db
			.select({
				reviewId: reviewTable.id,
				reviewerName: user.name,
				round: reviewRoundTable.name,
				anonymized: reviewRoundTable.anonymized,
				status: reviewTable.status,
				comment: reviewTable.comment,
				submittedAt: reviewTable.submittedAt,
				criterion: scorecardCriterionTable.label,
				criterionKind: scorecardCriterionTable.kind,
				value: reviewScoreTable.valueNumber,
				valueText: reviewScoreTable.valueText,
				weight: scorecardCriterionTable.weight,
				scaleMax: scorecardCriterionTable.scaleMax,
				position: scorecardCriterionTable.position
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
			.orderBy(asc(reviewTable.id), asc(scorecardCriterionTable.position)),
		db
			.select({ id: placementTable.id, status: placementTable.status })
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId))
	]);

	const reviews = new Map<
		number,
		{
			id: number;
			reviewerName: string;
			round: string;
			status: string;
			comment: string | null;
			submittedAt: Date | null;
			scores: {
				criterion: string;
				value: number | null;
				valueText: string | null;
				scaleMax: number | null;
			}[];
			score: number | null;
		}
	>();

	for (const r of reviewRows) {
		let review = reviews.get(r.reviewId);
		if (!review) {
			review = {
				id: r.reviewId,
				// ABS-07: the round can hide the reviewer's identity from the reviewer's
				// peers. The organizer still needs to know who has and has not answered,
				// so anonymisation here labels the row rather than dropping it.
				reviewerName: r.anonymized ? `Reviewer ${r.reviewId}` : (r.reviewerName ?? 'Reviewer'),
				round: r.round,
				status: r.status,
				comment: r.comment,
				submittedAt: r.submittedAt,
				scores: [],
				score: null
			};
			reviews.set(r.reviewId, review);
		}
		if (r.criterion) {
			review.scores.push({
				criterion: r.criterion,
				value: r.value === null ? null : Number(r.value),
				valueText: r.valueText,
				scaleMax: r.scaleMax
			});
		}
	}

	const reviewList = [...reviews.values()].map((review) => ({
		...review,
		score: submissionScore([
			{
				submitted: review.status === 'submitted',
				scores: review.scores.map((s) => ({
					value: s.value,
					weight: 1,
					scaleMax: s.scaleMax
				}))
			}
		])
	}));

	return {
		...row,
		speakers: speakers.get(submissionId) ?? [],
		answers,
		reviews: reviewList,
		score: submissionScore(reviewRowsToScores(reviewRows)),
		/** Ü6: is this talk already sitting in the agenda, and how firmly? */
		placements
	};
}

/** Regroups the flat review/score join into the shape the aggregate expects. */
function reviewRowsToScores(
	rows: {
		reviewId: number;
		status: string;
		value: string | null;
		weight: string | null;
		scaleMax: number | null;
	}[]
): ReviewScores[] {
	const byReview = new Map<number, ReviewScores>();
	for (const r of rows) {
		let review = byReview.get(r.reviewId);
		if (!review) {
			review = { submitted: r.status === 'submitted', scores: [] };
			byReview.set(r.reviewId, review);
		}
		if (r.value !== null && r.weight !== null) {
			review.scores.push({
				value: Number(r.value),
				weight: Number(r.weight),
				scaleMax: r.scaleMax
			});
		}
	}
	return [...byReview.values()];
}
