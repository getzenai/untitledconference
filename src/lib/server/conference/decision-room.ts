/**
 * The acceptance call (#444): slot arithmetic and one committee member's lobbying queue.
 *
 * The submissions table is built for asynchronous triage — filter, sort, bulk decide.
 * The meeting is a different room. There, the score does not decide; it sorts the pile
 * so the committee knows what to *discuss*, and the accept happens because somebody
 * argued for it. The two verbs from the interview are "lobby" (each member brings the
 * handful they want to fight for) and "rescue" (this one I flagged to reject, argue me
 * out of it) — which is why a rejected talk stays in the queue rather than leaving it.
 *
 * Everything on this screen is read per reviewer, on purpose. "My top-ranked, not yet
 * accepted" was the single view the organizer in that interview built for themselves
 * over their incumbent tool, and the only one the committee actually used on the call.
 */
import type { SlotLine } from '$lib/conference/decision-room';
import { reviewScore, submissionScore, type ReviewScores } from '$lib/conference/scoring';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
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
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

/** The one status the arithmetic counts. Waitlisted is not a slot spent. */
const ACCEPTED = 'accepted';

/**
 * Everything the room decides against: accepted, plus what is still arguable.
 *
 * Drafts are out — nobody handed them in — and so is `withdrawn`: the speaker took
 * it back, and a committee arguing over a talk that is no longer offered is the kind
 * of wasted minute this screen exists to prevent.
 */
const ARGUABLE = ['submitted', 'in_review', 'rejected', 'waitlisted', 'accepted'] as const;

export type LobbyRow = {
	submissionId: number;
	title: string;
	track: string | null;
	trackId: number | null;
	status: (typeof ARGUABLE)[number];
	/** This reviewer's own verdict, on the 1..5 scale the rest of the app shows. */
	myScore: number | null;
	/** Everyone's, so a lone champion is visible as one. */
	overallScore: number | null;
	/** How many people have handed in a review — context for the overall number. */
	reviewsSubmitted: number;
	/** This reviewer's own words, the thing they will read out on the call. */
	myComment: string | null;
	/**
	 * Organizer-only (#450). A sponsor talk is a fact the room must see, not a
	 * score and not an automatic decision. Reviewer views never select this.
	 */
	sponsorTier: string | null;
	/**
	 * Organizer-only (#445). A conditional accept is still an accept — the
	 * remainder does not change. The note is what the committee said.
	 */
	acceptCondition: string | null;
	acceptConditionOwner: string | null;
};

export type CommitteeSeat = { userId: string; name: string; queueLength: number };

/**
 * Slots on the grid held for a sponsor and still empty (#450).
 *
 * Counted, never subtracted. The committee's capacity is a number an organizer
 * typed, and we do not know whether they typed it with the sponsor slots in or out
 * — quietly taking these off the remainder would invent an answer. What the room
 * actually asks is whether there is anything to backfill: "we have four open
 * sponsor slots on day three, do you want to fill them with talks?"
 *
 * A hold with a submission in it is not counted: it is a talk now, not inventory.
 */
function sponsorHoldCount(conferenceId: number) {
	return db
		.select({ held: sql<number>`count(*)` })
		.from(placementTable)
		.where(
			and(
				eq(placementTable.conferenceId, conferenceId),
				eq(placementTable.kind, 'reservation'),
				isNull(placementTable.submissionId)
			)
		);
}

/** Accepted counts, overall and per track, straight from the status column. */
export async function slotBoard(conferenceId: number): Promise<{
	total: SlotLine;
	tracks: SlotLine[];
	/** Accepted talks with no track set — otherwise they vanish between the lines. */
	untracked: number;
	/** Empty sponsor holds on the grid — see `sponsorHoldCount`. */
	sponsorHolds: number;
}> {
	const [[conference], tracks, accepted, [holds]] = await Promise.all([
		db
			.select({ name: conferenceTable.name, slotCapacity: conferenceTable.slotCapacity })
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conferenceId)),
		db
			.select({
				id: trackTable.id,
				name: trackTable.name,
				slotCapacity: trackTable.slotCapacity
			})
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position), asc(trackTable.id)),
		db
			.select({ trackId: submissionTable.trackId, accepted: sql<number>`count(*)` })
			.from(submissionTable)
			.where(
				and(eq(submissionTable.conferenceId, conferenceId), eq(submissionTable.status, ACCEPTED))
			)
			.groupBy(submissionTable.trackId),
		sponsorHoldCount(conferenceId)
	]);

	const byTrack = new Map(accepted.map((row) => [row.trackId, Number(row.accepted)]));
	const total = accepted.reduce((sum, row) => sum + Number(row.accepted), 0);

	return {
		total: {
			id: null,
			name: conference?.name ?? 'Programme',
			capacity: conference?.slotCapacity ?? null,
			accepted: total
		},
		tracks: tracks.map((track) => ({
			id: track.id,
			name: track.name,
			capacity: track.slotCapacity,
			accepted: byTrack.get(track.id) ?? 0
		})),
		untracked: byTrack.get(null) ?? 0,
		sponsorHolds: Number(holds?.held ?? 0)
	};
}

/**
 * Who is in the room: everyone who has handed in at least one review here.
 *
 * Not the reviewer roster. An invited reviewer who never scored anything has no
 * ranking to lobby from, and an empty tab per absent name is how a screen built for
 * a 40-minute call becomes something you scroll past.
 */
export async function committeeSeats(conferenceId: number): Promise<CommitteeSeat[]> {
	const rows = await db
		.select({
			userId: reviewTable.reviewerUserId,
			name: user.name,
			email: user.email,
			queueLength: sql<number>`count(*)`
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(submissionTable, eq(submissionTable.id, reviewTable.submissionId))
		.innerJoin(user, eq(user.id, reviewTable.reviewerUserId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				eq(reviewTable.status, 'submitted'),
				inArray(submissionTable.status, [...ARGUABLE])
			)
		)
		.groupBy(reviewTable.reviewerUserId, user.name, user.email);

	return rows
		.map((row) => ({
			userId: row.userId,
			name: row.name?.trim() || row.email,
			queueLength: Number(row.queueLength)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

type ScoreRow = {
	reviewId: number;
	submissionId: number;
	reviewerUserId: string;
	submitted: boolean;
	value: string | null;
	weight: string | null;
	scaleMax: number | null;
};

/** One `ReviewScores` per review row, keyed by review id. */
function foldReviews(rows: ScoreRow[]) {
	const byReview = new Map<
		number,
		ReviewScores & { submissionId: number; reviewerUserId: string }
	>();
	for (const row of rows) {
		let review = byReview.get(row.reviewId);
		if (!review) {
			review = {
				submissionId: row.submissionId,
				reviewerUserId: row.reviewerUserId,
				submitted: row.submitted,
				scores: []
			};
			byReview.set(row.reviewId, review);
		}
		if (row.value === null || row.weight === null) continue;
		review.scores.push({
			value: Number(row.value),
			weight: Number(row.weight),
			scaleMax: row.scaleMax
		});
	}
	return [...byReview.values()];
}

/** What this member reviewed, with the talk it belongs to. One row per review. */
function myReviews(conferenceId: number, reviewerUserId: string) {
	return db
		.select({
			reviewId: reviewTable.id,
			submissionId: reviewTable.submissionId,
			comment: reviewTable.comment,
			title: submissionTable.title,
			status: submissionTable.status,
			trackId: submissionTable.trackId,
			track: trackTable.name,
			sponsorTier: sponsorTierTable.name,
			acceptCondition: submissionTable.acceptCondition,
			ownerName: user.name,
			ownerEmail: user.email
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(submissionTable, eq(submissionTable.id, reviewTable.submissionId))
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sponsorTierTable, eq(sponsorTierTable.id, submissionTable.sponsorTierId))
		.leftJoin(user, eq(user.id, submissionTable.acceptConditionOwnerId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				eq(reviewTable.reviewerUserId, reviewerUserId),
				eq(reviewTable.status, 'submitted'),
				inArray(submissionTable.status, [...ARGUABLE])
			)
		);
}

/**
 * Every review on those talks — everyone's, not just this member's.
 *
 * The pooled average is the second number on the row, and a lone champion is only
 * visible as one when both are on screen next to each other.
 */
function allReviewsOn(conferenceId: number, submissionIds: number[]) {
	return db
		.select({
			reviewId: reviewTable.id,
			submissionId: reviewTable.submissionId,
			reviewerUserId: reviewTable.reviewerUserId,
			submitted: sql<boolean>`${reviewTable.status} = 'submitted'`,
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
}

/**
 * One member's ranking of what they reviewed, best first, still arguable only.
 *
 * Accepted talks stay in the list rather than dropping out of it. A queue that
 * empties as the call proceeds reads as progress, but the member also has to see
 * that their number two got in — otherwise they lobby for it a second time.
 */
export async function lobbyingQueue(
	conferenceId: number,
	reviewerUserId: string
): Promise<LobbyRow[]> {
	const mine = await myReviews(conferenceId, reviewerUserId);
	if (mine.length === 0) return [];

	const submissionIds = [...new Set(mine.map((row) => row.submissionId))];
	const reviews = foldReviews(await allReviewsOn(conferenceId, submissionIds));

	const bySubmission = new Map<number, typeof reviews>();
	for (const review of reviews) {
		const list = bySubmission.get(review.submissionId) ?? [];
		list.push(review);
		bySubmission.set(review.submissionId, list);
	}

	const rows: LobbyRow[] = mine.map((row) => {
		const all = bySubmission.get(row.submissionId) ?? [];
		const own = all.find((review) => review.reviewerUserId === reviewerUserId);
		const ownScore = own ? reviewScore(own) : null;
		return {
			submissionId: row.submissionId,
			title: row.title,
			track: row.track,
			trackId: row.trackId,
			status: row.status as LobbyRow['status'],
			// `reviewScore` is 0..1; the 1..5 scale is what every other surface prints.
			myScore: ownScore === null ? null : ownScore * 5,
			overallScore: submissionScore(all),
			reviewsSubmitted: all.filter((review) => review.submitted).length,
			myComment: row.comment,
			sponsorTier: row.sponsorTier,
			acceptCondition: row.acceptCondition,
			acceptConditionOwner: row.ownerName?.trim() || row.ownerEmail || null
		};
	});

	// Their ranking, not ours: unscored rows sink rather than sorting as zero.
	return rows.sort(
		(a, b) => (b.myScore ?? -1) - (a.myScore ?? -1) || a.title.localeCompare(b.title)
	);
}

/** Writes the numbers the room argues against. `null` clears one back to unsaid. */
export async function setSlotCapacity(
	conferenceId: number,
	total: number | null,
	tracks: { id: number; capacity: number | null }[]
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(conferenceTable)
			.set({ slotCapacity: total })
			.where(eq(conferenceTable.id, conferenceId));

		for (const track of tracks) {
			// Scoped by conference as well as id: the ids arrive from a form, and a
			// track id from someone else's conference must not be writable here.
			await tx
				.update(trackTable)
				.set({ slotCapacity: track.capacity })
				.where(and(eq(trackTable.id, track.id), eq(trackTable.conferenceId, conferenceId)));
		}
	});
}
