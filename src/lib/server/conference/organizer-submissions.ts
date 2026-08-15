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
import { and, asc, count, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm';
import { agendaSlotsFor, programmeWhere, type AgendaSlot } from './submission-agenda';
import { orderFor, type SubmissionSort } from './submission-sort';
export type { AgendaSlot };

/** Where a talk stands in the programme — the filter's two answers (#412). */
export type AgendaFilter = 'scheduled' | 'unscheduled';

export type SubmissionFilters = {
	q?: string;
	status?: string[];
	trackId?: number;
	sessionFormatId?: number;
	/** Only what still has to be reviewed (#122). */
	needsReview?: boolean;
	/** In the programme, or still waiting for a slot (#412). */
	agenda?: AgendaFilter;
	/**
	 * Drafts are out unless this says otherwise (#412).
	 *
	 * The default is the inversion Fabian asked for: a draft has not been handed
	 * in, so it is not part of the organizer's pile. The flag lives on the filter
	 * object rather than in the URL parser alone, because the CSV export and any
	 * later caller read the same rule from here — a default that only the parser
	 * knows is one every other caller silently gets wrong.
	 */
	includeDrafts?: boolean;
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

/** What a row is before the speakers and the score are joined onto it. */
type SubmissionBase = {
	id: number;
	title: string;
	status: Submission['status'];
	contentApproval: Submission['contentApproval'];
	submittedAt: Date | null;
	track: string | null;
	sessionFormat: string | null;
	/** INTERNAL (R6) — organizer views only. */
	sponsorTier: string | null;
	/** A note on an accept, not a status (#445). Null is a clean accept. */
	acceptCondition: string | null;
	/** Display name of who will chase the condition. */
	acceptConditionOwner: string | null;
	/** Named editorial stand on an accept (#446). Null if not tracking yet. */
	editorialStand: Submission['editorialStand'];
};

export type SubmissionRow = SubmissionBase & {
	speakers: SpeakerLine[];
	score: number | null;
	reviewsSubmitted: number;
	reviewsAssigned: number;
	/** Null when the talk is not on the grid (#412). */
	agenda: AgendaSlot | null;
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

/**
 * Still to be reviewed: the live pipeline, whether or not a review is already in.
 *
 * The most-asked-for filter on this screen, and the definition is the one already
 * printed in the page header — the same expression feeds both, so the filter and
 * the count above it cannot drift apart. A filter that shows 14 rows under a
 * header saying 12 is a bug report, not a feature.
 *
 * Scope is submitted/in_review only. A talk someone has started reviewing moves
 * to `in_review` and often already has a handed-in review; it is still, in
 * plain language, still to review until it is decided (#261). Fabian's journey
 * review: accepted and withdrawn talks with no reviews still showed under
 * "still to review", which reads as open work when the decision is already
 * made. Those are decisions — use the status checkboxes for them. Drafts stay
 * out for the same reason as always: a draft has not been handed in; putting
 * it on the reviewers' pile would be reading somebody's notebook.
 *
 * AND with a status checkbox is intentional and can be empty: "accepted" +
 * still-to-review is a guaranteed empty set (accepted is never in the live
 * pipeline). That is okay — the checkboxes still mean what they say.
 */
function needsReviewWhere() {
	return inArray(submissionTable.status, ['submitted', 'in_review']);
}

/** The SQL predicate behind the filter bar. */
function submissionWhere(conferenceId: number, filters: SubmissionFilters) {
	// Drafts and the agenda select bring their own conditions (#412).
	const where = [eq(submissionTable.conferenceId, conferenceId), ...programmeWhere(filters)];

	if (filters.needsReview) where.push(needsReviewWhere());

	// Status checkboxes AND with still-to-review. Accepted + still-to-review is
	// empty by construction (see needsReviewWhere) — not a bug.
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

/** The columns both the table and the export read straight off the submission. */
const submissionColumns = {
	id: submissionTable.id,
	title: submissionTable.title,
	status: submissionTable.status,
	contentApproval: submissionTable.contentApproval,
	submittedAt: submissionTable.submittedAt,
	track: trackTable.name,
	sessionFormat: sessionFormatTable.name,
	sponsorTier: sponsorTierTable.name,
	acceptCondition: submissionTable.acceptCondition,
	editorialStand: submissionTable.editorialStand,
	ownerName: user.name,
	ownerEmail: user.email
};

function namedOwner(row: {
	acceptCondition: string | null;
	ownerName: string | null;
	ownerEmail: string | null;
}): Pick<SubmissionBase, 'acceptCondition' | 'acceptConditionOwner'> {
	return {
		acceptCondition: row.acceptCondition,
		acceptConditionOwner: row.ownerName?.trim() || row.ownerEmail || null
	};
}

/**
 * Hangs the speakers and the aggregate score onto a set of rows, in two queries.
 *
 * Shared by the table and the export so that the file an organizer downloads and the
 * screen they are looking at cannot disagree about a score.
 */
async function withSpeakersAndScores(
	conferenceId: number,
	rows: SubmissionBase[]
): Promise<SubmissionRow[]> {
	const ids = rows.map((r) => r.id);
	const [speakers, reviews, agenda] = await Promise.all([
		speakersFor(ids),
		reviewsFor(conferenceId, ids),
		agendaSlotsFor(ids)
	]);

	return rows.map((row) => {
		const rowReviews = reviews.get(row.id) ?? [];
		return {
			...row,
			speakers: speakers.get(row.id) ?? [],
			score: submissionScore(rowReviews),
			reviewsSubmitted: rowReviews.filter((r) => r.submitted).length,
			reviewsAssigned: rowReviews.length,
			agenda: agenda.get(row.id) ?? null
		};
	});
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
		.select(submissionColumns)
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		.leftJoin(user, eq(user.id, submissionTable.acceptConditionOwnerId))
		.where(where)
		// The id is not decoration: `submittedAt` is null for every draft, so without a
		// tiebreaker two pages of the same table could show the same row twice and skip
		// another one entirely. The same holds for the score, where ties are the rule
		// rather than the exception.
		.orderBy(...orderFor(sort, conferenceId))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	return {
		rows: await withSpeakersAndScores(
			conferenceId,
			rows.map((row) => ({ ...row, ...namedOwner(row) }))
		),
		matching,
		page,
		pageSize: PAGE_SIZE,
		pageCount
	};
}

/**
 * How many rows one export may carry (ABS-13).
 *
 * Not a preference either: the export walks the speaker and review joins for every
 * matching row, and a worker has a wall-clock and a memory budget. The number is far
 * above any real conference — the largest CFPs in this space land in the low
 * thousands — so in practice it is a fuse, not a policy. If it ever blows, the route
 * says so out loud rather than handing over a file that is quietly short.
 */
export const EXPORT_LIMIT = 5000;

export type SubmissionExport = {
	rows: SubmissionRow[];
	/** True when `EXPORT_LIMIT` cut the result — the caller must not stay quiet about it. */
	truncated: boolean;
};

/**
 * The whole filtered set, in the order the table is showing it (ABS-13).
 *
 * Same filters, same sort, no pagination: the file is the view the organizer is
 * looking at, not the fifty rows that happened to fit on the screen. An export that
 * silently held back page two would be worse than no export — a spreadsheet looks
 * complete no matter what is in it.
 */
export async function exportSubmissions(
	conferenceId: number,
	filters: SubmissionFilters = {},
	sort: SubmissionSort = 'newest'
): Promise<SubmissionExport> {
	const rows = await db
		.select(submissionColumns)
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		.leftJoin(user, eq(user.id, submissionTable.acceptConditionOwnerId))
		.where(submissionWhere(conferenceId, filters))
		.orderBy(...orderFor(sort, conferenceId))
		// One more than the fuse, so "we hit the limit" can be told apart from "the
		// conference happens to have exactly that many".
		.limit(EXPORT_LIMIT + 1);

	const truncated = rows.length > EXPORT_LIMIT;
	const sliced = (truncated ? rows.slice(0, EXPORT_LIMIT) : rows).map((row) => ({
		...row,
		...namedOwner(row)
	}));
	return {
		rows: await withSpeakersAndScores(conferenceId, sliced),
		truncated
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

	// The very predicate the "still to review" filter applies (#122), not a second
	// spelling of it. This number is a link to that filter now, and a header that
	// promised 12 and then showed 14 rows would be the first thing an organizer
	// stopped trusting on this screen. After #261 that predicate is the live
	// pipeline — same set as `undecided` — not "zero reviews handed in".
	const [row] = await db
		.select({
			total: count(),
			undecided: sql<number>`count(*) filter (where ${undecided})`,
			unreviewed: sql<number>`count(*) filter (where ${needsReviewWhere()})`
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
			sponsorNote: sponsorTierTable.note,
			acceptCondition: submissionTable.acceptCondition,
			editorialStand: submissionTable.editorialStand,
			ownerName: user.name,
			ownerEmail: user.email
		})
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		.leftJoin(user, eq(user.id, submissionTable.acceptConditionOwnerId))
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
			reviewerEmail: user.email,
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
		// ABS-07 hides a reviewer from their *peers*, not from the organizer: this page
		// already lists the same people by name and email in the assignment block below,
		// so numbering them "Reviewer 1" here hid nothing and only cost the organizer the
		// link between a score and a person (#416). The flag stays because the organizer
		// still has to see that the round is blind — it labels the row, it no longer
		// replaces the name.
		anonymized: r.anonymized,
		// An account can carry an empty name — registration does not insist on one —
		// and a blank line is a worse answer to "who reviewed this" than the address
		// the assignment block below already prints. The old `?? 'Reviewer'` only
		// caught null, so the empty string fell through to nothing on screen.
		reviewerName: r.reviewerName?.trim() || r.reviewerEmail || 'Reviewer',
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
	const { ownerName, ownerEmail, ...header } = row;

	return {
		...header,
		...namedOwner({ acceptCondition: row.acceptCondition, ownerName, ownerEmail }),
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
