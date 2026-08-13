/**
 * The reviewer's side of the product: their queue, one submission, and their verdict.
 *
 * Three boundaries live here, and all three are queries rather than markup:
 *
 * - **Assignment.** A reviewer reads the submissions they were assigned and no others
 *   (ABS-05). The queue is built FROM the `review` rows, not from the submissions with
 *   a filter — the difference is what happens when the filter is forgotten.
 * - **Visibility.** `blind_until_reviewed` leaves peers' scores and comments out of the
 *   SELECT until this reviewer has filed their own. Blind that is enforced in the
 *   template is not blind.
 * - **Anonymity.** A round can hide the author from its reviewers (ABS-07); then the
 *   speaker names never reach the page.
 * - **The round's window.** A round that has not opened, or has closed, takes nothing
 *   (ABS-01). Checked in `saveReview` and not only drawn on the form, for the same
 *   reason a withdrawn talk is: a POST does not care what the page currently shows.
 *
 * And one thing that deliberately does NOT happen here: saving a review sends no mail.
 * Deciding and telling people are separate acts, and a status that mails on its own
 * takes that choice away from the organizer.
 */
import { peerDisplayLabels } from '$lib/conference/anonymous-reviewers';
import {
	canSeePeerReviews,
	sortQueue,
	type QueueSort,
	type ReviewVisibility
} from '$lib/conference/review-visibility';
import {
	byRoundWindowPriority,
	combineRoundWindows,
	roundWindow,
	type RoundWindow
} from '$lib/conference/round-window';
import { submissionScore, type ReviewScores } from '$lib/conference/scoring';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	formFieldTable,
	submissionAnswerTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	membershipTable,
	sessionFormatTable,
	speakerProfileTable,
	trackTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewScoreTable,
	reviewTable,
	scorecardCriterionTable,
	type Review
} from '$lib/server/db/conference/review-schema';
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

/** Every review round of a conference — the unit reviewer memberships are scoped to. */
async function roundsOf(conferenceId: number): Promise<number[]> {
	const rows = await db
		.select({ id: reviewRoundTable.id })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(eq(evaluationPlanTable.conferenceId, conferenceId));

	return rows.map((r) => r.id);
}

export type ReviewerContext = { conference: Conference; roundIds: number[] };

/**
 * Resolves the conference behind `slug` and asserts that `userId` reviews for it.
 *
 * 404 in both failure cases, exactly as `requireOrganizer` does: a reviewer who was
 * never added must not learn from the status code that the conference exists.
 */
export async function requireReviewer(userId: string, slug: string): Promise<ReviewerContext> {
	const [conference] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, slug))
		.limit(1);

	if (!conference) throw error(404, 'Conference not found');

	const roundIds = await roundsOf(conference.id);
	if (!(await hasReviewerSeat(conference.id, roundIds, userId))) {
		throw error(404, 'Conference not found');
	}

	return { conference, roundIds };
}

/**
 * Does this user hold a reviewer seat for this conference — at conference scope or
 * in one of its rounds?
 *
 * Split out of `requireReviewer` so a caller that must not throw can ask the same
 * question the reviewer surface answers with a 404. Two places deciding "may this
 * person review here" by different rules is how a link that leads to a 404 gets
 * shipped.
 */
async function hasReviewerSeat(
	conferenceId: number,
	roundIds: number[],
	userId: string
): Promise<boolean> {
	const seats = await db
		.select({ scopeType: membershipTable.scopeType, scopeId: membershipTable.scopeId })
		.from(membershipTable)
		.where(and(eq(membershipTable.userId, userId), eq(membershipTable.role, 'reviewer')));

	return seats.some(
		(s) =>
			(s.scopeType === 'conference' && s.scopeId === conferenceId) ||
			(s.scopeType === 'round' && roundIds.includes(s.scopeId))
	);
}

export type OwnReviewAccess = { reviewId: number; status: Review['status'] };

/**
 * The reviewer form this user may open for this submission, or `null`.
 *
 * Both halves are load-bearing and they are checked against each other on purpose:
 * the seat is what `requireReviewer` demands, the non-recused review row is what
 * `reviewerSubmission` demands, and the page needs *both* before it may offer a
 * link. An assignment can outlive the seat that produced it — the assignment matrix
 * carries such a reviewer as `eligible: false` — and offering that person a way in
 * would hand them a 404 for a thing the screen just told them they could do.
 */
export async function ownReviewAccess(
	conferenceId: number,
	userId: string,
	submissionId: number
): Promise<OwnReviewAccess | null> {
	const roundIds = await roundsOf(conferenceId);
	if (roundIds.length === 0) return null;
	if (!(await hasReviewerSeat(conferenceId, roundIds, userId))) return null;

	const own = await ownReview(conferenceId, userId, submissionId);
	return own ? { reviewId: own.reviewId, status: own.status } : null;
}

/** The conferences this user reviews for, for the picker. */
export async function reviewedConferences(userId: string): Promise<Conference[]> {
	const seats = await db
		.select({ scopeType: membershipTable.scopeType, scopeId: membershipTable.scopeId })
		.from(membershipTable)
		.where(and(eq(membershipTable.userId, userId), eq(membershipTable.role, 'reviewer')));

	if (seats.length === 0) return [];

	const conferenceIds = seats.filter((s) => s.scopeType === 'conference').map((s) => s.scopeId);
	const roundIds = seats.filter((s) => s.scopeType === 'round').map((s) => s.scopeId);

	const viaRounds =
		roundIds.length === 0
			? []
			: (
					await db
						.select({ conferenceId: evaluationPlanTable.conferenceId })
						.from(reviewRoundTable)
						.innerJoin(
							evaluationPlanTable,
							eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId)
						)
						.where(inArray(reviewRoundTable.id, roundIds))
				).map((r) => r.conferenceId);

	const ids = [...new Set([...conferenceIds, ...viaRounds])];
	if (ids.length === 0) return [];

	return db.select().from(conferenceTable).where(inArray(conferenceTable.id, ids));
}

/** Every review on these submissions, with its per-criterion scores folded in. */
async function reviewsOn(conferenceId: number, submissionIds: number[]) {
	if (submissionIds.length === 0) return [];

	const rows = await db
		.select({
			id: reviewTable.id,
			submissionId: reviewTable.submissionId,
			reviewerUserId: reviewTable.reviewerUserId,
			reviewerName: user.name,
			anonymized: reviewRoundTable.anonymized,
			roundName: reviewRoundTable.name,
			status: reviewTable.status,
			comment: reviewTable.comment,
			submittedAt: reviewTable.submittedAt,
			criterion: scorecardCriterionTable.label,
			criterionId: scorecardCriterionTable.id,
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
				inArray(reviewTable.submissionId, submissionIds),
				ne(reviewTable.status, 'recused')
			)
		)
		.orderBy(asc(reviewTable.id), asc(scorecardCriterionTable.position));

	return rows;
}

type ReviewRow = Awaited<ReturnType<typeof reviewsOn>>[number];

export type PeerReview = {
	id: number;
	reviewer: string;
	/** Which scorecard this answer set belongs to — explains multi-round schema mix. */
	roundName: string;
	submitted: boolean;
	comment: string | null;
	submittedAt: Date | null;
	scores: { criterion: string; value: number | null; valueText: string | null }[];
	score: number | null;
};

/** Folds the flat join into one entry per review, with that reviewer's own average. */
function groupReviews(
	rows: ReviewRow[]
): (PeerReview & { submissionId: number; userId: string })[] {
	const byId = new Map<
		number,
		PeerReview & { submissionId: number; userId: string; raw: ReviewScores }
	>();

	// Peer-to-peer always uses Reviewer N (RV-P1-02). Mixing open-round real names
	// with anonymised labels on one talk looks broken and leaks identity next to
	// deliberately hidden peers. Organizers still see real names on their path.
	const labels = peerDisplayLabels(rows);

	for (const r of rows) {
		let review = byId.get(r.id);
		if (!review) {
			review = {
				id: r.id,
				submissionId: r.submissionId,
				userId: r.reviewerUserId,
				reviewer: labels.get(r.id) ?? 'Reviewer',
				roundName: r.roundName,
				submitted: r.status === 'submitted',
				comment: r.comment,
				submittedAt: r.submittedAt,
				scores: [],
				score: null,
				raw: { submitted: r.status === 'submitted', scores: [] }
			};
			byId.set(r.id, review);
		}
		if (!r.criterion) continue;

		review.scores.push({
			criterion: r.criterion,
			value: r.value === null ? null : Number(r.value),
			valueText: r.valueText
		});
		review.raw.scores.push({
			value: r.value === null ? null : Number(r.value),
			weight: r.weight === null ? 1 : Number(r.weight),
			scaleMax: r.scaleMax
		});
	}

	return [...byId.values()].map(({ raw, ...review }) => ({
		...review,
		score: submissionScore([raw])
	}));
}

export type QueueEntry = {
	submissionId: number;
	title: string;
	track: string | null;
	sessionFormat: string | null;
	/**
	 * Every round this reviewer holds this submission in, in board order. The id
	 * rides along because the detail page needs it in the link: one row per
	 * submission, and two open rounds are two different scorecards (#294).
	 */
	rounds: { id: number; name: string }[];
	/**
	 * Whether any of those rounds is taking answers (ABS-01), so the queue can say
	 * "opens in 2 days" or "closed" instead of linking to a form that refuses.
	 */
	window: RoundWindow;
	reviewsSubmitted: number;
	reviewsAssigned: number;
	/** Null when the mode withholds it, or when nobody has scored yet. */
	score: number | null;
	/** True only when this reviewer has filed in *every* round they hold it in. */
	ownReviewSubmitted: boolean;
	/**
	 * The speaker took the talk back. Kept in the queue rather than dropped, the
	 * same way an anonymised review is labelled rather than hidden: a row that
	 * silently disappears is indistinguishable from one that was never assigned,
	 * and a reviewer who already read it deserves to know why it stopped mattering.
	 */
	withdrawn: boolean;
};

/**
 * The reviewer's working list.
 *
 * Built from their own `review` rows, so a submission they were not assigned cannot
 * appear even if the sort or the filter is wrong. The number of reviews stays visible
 * in every mode — it is the coverage signal the queue exists for, and "two people have
 * answered" gives away no opinion. The score does not.
 */
export async function reviewQueue(
	conference: Conference,
	userId: string,
	sort: QueueSort = 'coverage'
): Promise<QueueEntry[]> {
	const assignments = await db
		.select({
			submissionId: reviewTable.submissionId,
			status: reviewTable.status,
			roundId: reviewRoundTable.id,
			roundName: reviewRoundTable.name,
			roundPosition: reviewRoundTable.position,
			roundOpensAt: reviewRoundTable.opensAt,
			roundClosesAt: reviewRoundTable.closesAt,
			title: submissionTable.title,
			track: trackTable.name,
			sessionFormat: sessionFormatTable.name,
			submissionStatus: submissionTable.status
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(submissionTable, eq(submissionTable.id, reviewTable.submissionId))
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conference.id),
				eq(reviewTable.reviewerUserId, userId),
				ne(reviewTable.status, 'recused')
			)
		);

	const bySubmission = groupAssignments(assignments);
	const all = groupReviews(await reviewsOn(conference.id, [...bySubmission.keys()]));
	const mode = conference.reviewVisibility as ReviewVisibility;

	const rows = [...bySubmission.values()].map((mine) =>
		queueRow(
			mine,
			all.filter((r) => r.submissionId === mine[0].submissionId),
			mode
		)
	);

	return sortQueue(rows, sort);
}

type Assignment = {
	submissionId: number;
	status: string;
	roundId: number;
	roundName: string;
	roundPosition: number;
	roundOpensAt: Date | null;
	roundClosesAt: Date | null;
	title: string;
	track: string | null;
	sessionFormat: string | null;
	submissionStatus: string;
};

/**
 * One entry per submission, not per assignment.
 *
 * A reviewer who holds the same talk in two rounds has one job — read it and say
 * what they think — and a queue that lists it twice invites them to do that work
 * twice. It also broke the page outright: the template keys on `submissionId`, so
 * the second row was a duplicate key and Svelte refused to render anything at all.
 */
function groupAssignments(assignments: Assignment[]): Map<number, Assignment[]> {
	const bySubmission = new Map<number, Assignment[]>();
	for (const row of assignments) {
		bySubmission.set(row.submissionId, [...(bySubmission.get(row.submissionId) ?? []), row]);
	}
	return bySubmission;
}

/** One submission as the reviewer's queue shows it, across every round they hold it in. */
function queueRow(
	mine: Assignment[],
	on: (PeerReview & { submissionId: number })[],
	mode: ReviewVisibility
): QueueEntry {
	const [first] = mine;
	// Outstanding in any round means outstanding: the queue is a to-do list, and
	// finishing round 1 does not answer round 2.
	const ownSubmitted = mine.every((row) => row.status === 'submitted');
	const withdrawn = first.submissionStatus === 'withdrawn';
	const inBoardOrder = [...mine].sort((a, b) => a.roundPosition - b.roundPosition);

	return {
		submissionId: first.submissionId,
		title: first.title,
		track: first.track,
		sessionFormat: first.sessionFormat,
		rounds: inBoardOrder.map((row) => ({ id: row.roundId, name: row.roundName })),
		// Built from the same rows in the same order `ownReview` reads them, so the
		// window this row advertises is the window of the round the link leads to.
		window: combineRoundWindows(
			inBoardOrder.map((row) => roundWindow(row.roundOpensAt, row.roundClosesAt))
		),
		reviewsSubmitted: on.filter((r) => r.submitted).length,
		reviewsAssigned: on.length,
		score: canSeePeerReviews(mode, ownSubmitted) ? scoresFor(on) : null,
		// Left honest: this says whether THIS reviewer filed, and the blind mode keys
		// off it. Whether the talk still needs anyone is `withdrawn`, and the page
		// reads the two separately — folding them together would badge a withdrawn
		// talk "Reviewed" and hand out peer scores the reader has not earned.
		ownReviewSubmitted: ownSubmitted,
		withdrawn
	};
}

/** The aggregate over a submission's reviews, rebuilt from the grouped rows. */
function scoresFor(reviews: (PeerReview & { submissionId: number })[]): number | null {
	const values = reviews.filter((r) => r.submitted && r.score !== null).map((r) => r.score!);
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

export type ReviewerSubmission = {
	id: number;
	title: string;
	/** `withdrawn` closes the form: the talk is gone and no answer is wanted. */
	status: string;
	abstract: string | null;
	keyTakeaway: string | null;
	audienceLevel: string | null;
	track: string | null;
	sessionFormat: string | null;
	/** Empty when the round is anonymised — the identity never leaves the database. */
	speakers: string[];
	anonymized: boolean;
	/** The round this scorecard belongs to — the page puts it in the link (#294). */
	round: { id: number; name: string };
	/**
	 * Every round this reviewer holds this submission in, in board order, so the page
	 * can offer the other scorecards. One entry is the normal case and draws nothing.
	 */
	rounds: { id: number; name: string; window: RoundWindow }[];
	/**
	 * When this round takes answers (ABS-01). The form reads it to say why it is shut;
	 * `saveReview` re-asks it on the POST, so a stale tab buys nothing.
	 */
	window: RoundWindow;
	own: {
		reviewId: number;
		status: string;
		comment: string | null;
	};
	criteria: {
		id: number;
		label: string;
		kind: string;
		scaleMax: number | null;
		options: string | null;
		value: number | null;
		valueText: string | null;
	}[];
	/**
	 * Only the peers who have SUBMITTED, and empty in `blind_until_reviewed` until the
	 * own review is submitted. A draft never leaves the server.
	 */
	peers: PeerReview[];
	/** Assigned peers who have not filed yet — a count, never their answers. */
	peersPending: number;
	peersWithheld: boolean;
	/**
	 * Custom CFP answers, in form order. Title / abstract / takeaway already sit
	 * on the page; these are the extra questions the reviewer was scoring without.
	 */
	answers: { label: string; kind: string; value: string | null }[];
};

/**
 * One assigned submission, with this reviewer's own answers and — if the mode allows
 * it — everybody else's.
 *
 * A submission this user was not assigned is a 404, not an empty page: the queue and
 * the detail must answer the same question about who may read what.
 */
export async function reviewerSubmission(
	conference: Conference,
	userId: string,
	submissionId: number,
	roundId?: number | null
): Promise<ReviewerSubmission | null> {
	// Read every assignment once: the pick needs the priority order, and the page
	// needs the whole list to link the sibling rounds (#294).
	const held = await ownReviewRows(conference.id, userId, submissionId);
	const own = roundId == null ? held[0] : held.find((row) => row.roundId === roundId);
	if (!own) return null;

	const submission = await submissionFor(conference.id, submissionId);
	if (!submission) return null;

	const [criteria, speakers, everyReview, answers] = await Promise.all([
		criteriaWithOwnAnswers(own.roundId, own.reviewId),
		own.anonymized ? Promise.resolve([]) : speakersOn(submissionId),
		reviewsOn(conference.id, [submissionId]),
		// Custom answers are the organizer's extra questions — "Kurzbio", "Why you?" —
		// and they name the speaker as reliably as the speakers list. The same
		// `own.anonymized` branch that skips speakers must skip them too. Dropping
		// every answer is honest: a field-type heuristic would still leak a name
		// typed into a select or a boolean's label, and a reviewer in a blind round
		// is not meant to score the person.
		own.anonymized ? Promise.resolve([]) : answersOn(submissionId)
	]);

	const visible = canSeePeerReviews(
		conference.reviewVisibility as ReviewVisibility,
		own.status === 'submitted'
	);
	// Only SUBMITTED peers carry their answers to the client. An assigned-but-unfiled
	// review is somebody's half-finished draft: nulling its aggregate while shipping the
	// raw criterion values and the comment would defeat the blind mode at exactly the
	// moment it matters. What survives of an unfiled peer is a count — how many people
	// still owe an answer is coverage, not opinion.
	const others = groupReviews(everyReview).filter((r) => r.userId !== userId);
	const peers = others.filter((r) => r.submitted);
	const peersPending = others.length - peers.length;

	return {
		...submission,
		speakers,
		anonymized: own.anonymized,
		round: { id: own.roundId, name: own.roundName },
		rounds: [...held]
			.sort((a, b) => a.roundPosition - b.roundPosition || a.roundId - b.roundId)
			.map((row) => ({ id: row.roundId, name: row.roundName, window: row.window })),
		window: own.window,
		own: { reviewId: own.reviewId, status: own.status, comment: own.comment },
		criteria,
		peers: visible ? peers.map(({ submissionId: _s, userId: _u, ...peer }) => peer) : [],
		peersPending,
		peersWithheld: !visible && peers.length > 0,
		answers
	};
}

/** The configurable CFP answers, in the order the form asked them. */
function answersOn(submissionId: number) {
	return db
		.select({
			label: formFieldTable.label,
			kind: formFieldTable.kind,
			value: submissionAnswerTable.value
		})
		.from(submissionAnswerTable)
		.innerJoin(formFieldTable, eq(formFieldTable.id, submissionAnswerTable.formFieldId))
		.where(eq(submissionAnswerTable.submissionId, submissionId))
		.orderBy(asc(formFieldTable.position), asc(formFieldTable.id));
}

/**
 * This reviewer's own row on this submission — and the assignment check in one.
 *
 * Everything else on the page hangs off it: no row means not assigned, which is a 404
 * rather than an empty page.
 *
 * A reviewer can hold the same submission in several rounds — the queue says so in as
 * many words — so this can match more than one row, and *which* one it is now decides
 * whether the form is locked and whether `saveReview` refuses (ABS-01). It used to be
 * `.limit(1)` with no order, which was harmless while only `anonymized` and the
 * comment hung off it. It is not harmless now: the queue would say "To do" from the
 * open round while the page it links to reported the closed one, depending on which
 * row Postgres happened to return.
 *
 * So the same rule the queue uses picks it — `byRoundWindowPriority`, the round that
 * still wants work first — and the query orders by round position and id underneath,
 * so equal states resolve the same way on every request.
 */
async function ownReviewRows(conferenceId: number, userId: string, submissionId: number) {
	const rows = await db
		.select({
			reviewId: reviewTable.id,
			status: reviewTable.status,
			submittedAt: reviewTable.submittedAt,
			comment: reviewTable.comment,
			roundId: reviewRoundTable.id,
			roundName: reviewRoundTable.name,
			roundPosition: reviewRoundTable.position,
			anonymized: reviewRoundTable.anonymized,
			opensAt: reviewRoundTable.opensAt,
			closesAt: reviewRoundTable.closesAt
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				eq(reviewTable.reviewerUserId, userId),
				eq(reviewTable.submissionId, submissionId),
				ne(reviewTable.status, 'recused')
			)
		)
		.orderBy(asc(reviewRoundTable.position), asc(reviewTable.id));

	return rows
		.map((row) => ({ ...row, window: roundWindow(row.opensAt, row.closesAt) }))
		.sort((a, b) => byRoundWindowPriority(a.window, b.window));
}

/**
 * The one row the page works on: the named round if the URL named one, else the
 * round with the most work outstanding.
 *
 * `roundId` is what closes #294. Two OPEN rounds are a tie under
 * `byRoundWindowPriority`, so the priority rule can only ever return the lower
 * position — a reviewer who holds the talk in both could not reach the second
 * scorecard through a URL that does not say which one it means. Naming a round
 * this reviewer does not hold answers `null`, the same as not being assigned at
 * all: an id in a query string is not a permission.
 */
async function ownReview(
	conferenceId: number,
	userId: string,
	submissionId: number,
	roundId?: number | null
) {
	const rows = await ownReviewRows(conferenceId, userId, submissionId);
	if (roundId != null) return rows.find((row) => row.roundId === roundId) ?? null;
	return rows[0] ?? null;
}

/** The proposal itself, scoped by conference so an id from the URL cannot travel. */
async function submissionFor(conferenceId: number, submissionId: number) {
	const [submission] = await db
		.select({
			id: submissionTable.id,
			title: submissionTable.title,
			status: submissionTable.status,
			abstract: submissionTable.abstract,
			keyTakeaway: submissionTable.keyTakeaway,
			audienceLevel: submissionTable.audienceLevel,
			track: trackTable.name,
			sessionFormat: sessionFormatTable.name
		})
		.from(submissionTable)
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.where(
			and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
		)
		.limit(1);

	return submission ?? null;
}

async function speakersOn(submissionId: number): Promise<string[]> {
	const rows = await db
		.select({ name: speakerProfileTable.name })
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(eq(submissionSpeakerTable.submissionId, submissionId))
		.orderBy(asc(submissionSpeakerTable.position));

	return rows.map((r) => r.name);
}

/** The round's scorecard with whatever this reviewer has already entered. */
async function criteriaWithOwnAnswers(roundId: number, reviewId: number) {
	const rows = await db
		.select({
			id: scorecardCriterionTable.id,
			label: scorecardCriterionTable.label,
			kind: scorecardCriterionTable.kind,
			scaleMax: scorecardCriterionTable.scaleMax,
			options: scorecardCriterionTable.options,
			value: reviewScoreTable.valueNumber,
			valueText: reviewScoreTable.valueText
		})
		.from(scorecardCriterionTable)
		.leftJoin(
			reviewScoreTable,
			and(
				eq(reviewScoreTable.scorecardCriterionId, scorecardCriterionTable.id),
				eq(reviewScoreTable.reviewId, reviewId)
			)
		)
		.where(eq(scorecardCriterionTable.reviewRoundId, roundId))
		.orderBy(asc(scorecardCriterionTable.position), asc(scorecardCriterionTable.id));

	return rows.map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) }));
}

export type ReviewDraft = {
	/** Criterion id -> what the reviewer entered. */
	answers: Record<number, string>;
	comment: string;
	/** `false` saves progress without unlocking peers or counting towards coverage. */
	submit: boolean;
};

/**
 * Did the reviewer actually put something down?
 *
 * Mirrors `writeScore` exactly, and has to: a rating outside its own scale is stored
 * as null there, so counting it as an answer here would let "50" on a five-point
 * scale pass for an opinion that never reaches the database.
 *
 * A comment counts. The issue asked for "at least one answered criterion", but a
 * reviewer who writes a paragraph and leaves the numbers alone has formed and
 * recorded a judgement — refusing that would reject a real review to catch nobody,
 * since a hostile reviewer types one character either way. What this refuses is the
 * genuinely empty submit.
 */
function hasSomethingToSay(criteria: Criterion[], draft: ReviewDraft): boolean {
	if (draft.comment.trim() !== '') return true;

	return criteria.some((criterion) => {
		const raw = (draft.answers[criterion.id] ?? '').trim();
		return criterion.kind === 'rating' ? ratingValue(raw, criterion) !== null : raw !== '';
	});
}

export type SaveReviewResult =
	| { ok: true }
	/** Not this reviewer's to write — the caller owes a 404, not a validation message. */
	| { ok: false; reason: 'not_assigned' }
	/** Submitting nothing at all; saving nothing is still fine. */
	| { ok: false; reason: 'empty_submit' }
	/** The speaker took the talk back while this form was open. */
	| { ok: false; reason: 'withdrawn' }
	/**
	 * The round is not taking answers (ABS-01). Two reasons rather than one, because
	 * "come back on Monday" and "you are too late" ask opposite things of the reader.
	 */
	| { ok: false; reason: 'round_not_open' | 'round_closed' };

/**
 * Saves this reviewer's answers.
 *
 * One transaction, and no notification of any kind: a review changing state is not an
 * event anybody should be mailed about automatically. The organizer decides when
 * people are told.
 *
 * Two rules exist here because `blind_until_reviewed` unlocks the peers on a status
 * flag, which makes that flag worth gaming (#33):
 *
 *  - **An empty review cannot be submitted.** Otherwise "submit nothing" buys every
 *    peer's score and comment before forming an opinion — precisely the anchoring the
 *    mode exists to prevent.
 *  - **Submitted never goes back.** Re-locking the peers would be honest enough, but
 *    the reviewer has already read them; what un-submitting really did was remove the
 *    review from the coverage count, so the queue claimed fewer people had seen the
 *    answers than actually had. Editing a submitted review stays possible — it is only
 *    the retreat to `assigned` that is refused, and `submittedAt` keeps the FIRST
 *    time, because that is the moment the peers became visible.
 *
 * Recusal is the deliberate way out and still clears both (`recuseReview`).
 */
export async function saveReview(
	conference: Conference,
	userId: string,
	submissionId: number,
	draft: ReviewDraft,
	roundId?: number | null
): Promise<SaveReviewResult> {
	// The same query the page used to decide whether this reviewer may be here at all:
	// the assignment is the permission. And the same round: the POST names the round
	// the form was drawn for, or the write lands in the round the priority rule picks
	// — which for two open rounds is never the second one (#294).
	const own = await ownReview(conference.id, userId, submissionId, roundId);
	if (!own) return { ok: false, reason: 'not_assigned' };

	// Checked here rather than only hidden on the page. The queue stops offering a
	// withdrawn talk, but a tab opened before the speaker pulled it still holds a
	// working form, and a POST does not care what the page currently draws.
	const submission = await submissionFor(conference.id, submissionId);
	if (submission?.status === 'withdrawn') return { ok: false, reason: 'withdrawn' };

	// The round's window (ABS-01), asked here and not only drawn on the form. A date
	// a POST can go straight through is a note, not a deadline. It gates the DRAFT
	// too: "save progress" writes the same scores the submit does, so allowing it
	// after the close would hand back the whole edit through the quieter button.
	if (own.window.state === 'not_yet_open') return { ok: false, reason: 'round_not_open' };
	if (own.window.state === 'closed') return { ok: false, reason: 'round_closed' };

	const criteria = await db
		.select({
			id: scorecardCriterionTable.id,
			kind: scorecardCriterionTable.kind,
			scaleMax: scorecardCriterionTable.scaleMax
		})
		.from(scorecardCriterionTable)
		.where(eq(scorecardCriterionTable.reviewRoundId, own.roundId));

	if (draft.submit && !hasSomethingToSay(criteria, draft)) {
		return { ok: false, reason: 'empty_submit' };
	}

	// Already filed stays filed: `draft.submit === false` on a submitted review saves
	// the edit and leaves the status alone.
	const alreadySubmitted = own.status === 'submitted';
	const submitting = draft.submit || alreadySubmitted;

	await db.transaction(async (tx) => {
		for (const criterion of criteria) {
			await writeScore(tx, own.reviewId, criterion, draft.answers[criterion.id] ?? '');
		}

		await tx
			.update(reviewTable)
			.set({
				comment: draft.comment.trim() || null,
				status: submitting ? 'submitted' : 'assigned',
				// The first filing, not the latest edit: it dates when the peers stopped
				// being hidden from this reviewer.
				submittedAt: submitting ? (own.submittedAt ?? new Date()) : null
			})
			.where(eq(reviewTable.id, own.reviewId));
	});

	return { ok: true };
}

export type RecuseReviewResult =
	| { ok: true }
	/** No matching outstanding assignment — wrong id, already submitted, or not theirs. */
	| { ok: false; reason: 'not_found' }
	/**
	 * The speaker took the talk back. Recusing would delete the queue row and hide
	 * the withdrawn talk entirely (#183) — the same silent vanishing #180 avoids
	 * for "to do" rows. Blocked the same way `saveReview` is.
	 */
	| { ok: false; reason: 'withdrawn' };

/**
 * Recuses one exact assigned review without letting a forged id cross its boundary.
 *
 * Withdrawn talks refuse recusal: the queue keeps the row visible as withdrawn
 * (#180), and clearing the assignment would erase that signal.
 */
export async function recuseReview(
	conferenceId: number,
	userId: string,
	submissionId: number,
	reviewId: number
): Promise<RecuseReviewResult> {
	const submission = await submissionFor(conferenceId, submissionId);
	if (submission?.status === 'withdrawn') return { ok: false, reason: 'withdrawn' };

	const roundIds = await roundsOf(conferenceId);
	if (roundIds.length === 0) return { ok: false, reason: 'not_found' };
	const recused = await db
		.update(reviewTable)
		.set({ status: 'recused', submittedAt: null })
		.where(
			and(
				eq(reviewTable.id, reviewId),
				eq(reviewTable.reviewerUserId, userId),
				eq(reviewTable.submissionId, submissionId),
				eq(reviewTable.status, 'assigned'),
				inArray(reviewTable.reviewRoundId, roundIds)
			)
		)
		.returning({ id: reviewTable.id });

	return recused.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

type Criterion = { id: number; kind: string; scaleMax: number | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One answer, written where the reviewer's previous one was. */
function writeScore(tx: Tx, reviewId: number, criterion: Criterion, answer: string) {
	const raw = answer.trim();
	const columns = {
		valueNumber: ratingValue(raw, criterion),
		valueText: criterion.kind === 'rating' ? null : raw || null
	};

	return tx
		.insert(reviewScoreTable)
		.values({ reviewId, scorecardCriterionId: criterion.id, ...columns })
		.onConflictDoUpdate({
			target: [reviewScoreTable.reviewId, reviewScoreTable.scorecardCriterionId],
			set: columns
		});
}

/**
 * A rating outside its own scale is dropped rather than clamped.
 *
 * Clamping would silently turn a mistyped 50 into a 5 and count it as an opinion the
 * reviewer never held; a blank criterion is honestly "not answered".
 */
function ratingValue(raw: string, criterion: { kind: string; scaleMax: number | null }) {
	if (criterion.kind !== 'rating' || raw === '') return null;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0) return null;
	if (criterion.scaleMax && value > criterion.scaleMax) return null;
	return String(value);
}
