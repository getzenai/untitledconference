/** Organizer-side review assignments, reviewer progress, and reminders. */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	membershipTable,
	membershipTrackTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { emailLogTable, type EmailLog } from '$lib/server/db/conference/email-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable,
	type Review
} from '$lib/server/db/conference/review-schema';
import { and, asc, count, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { dispatchConferenceEmails } from './email-dispatcher';
import { conferenceReviewerMemberships } from './reviewer-memberships';

export type AssignmentReviewer = {
	userId: string;
	name: string;
	email: string;
	status: Review['status'] | null;
	eligible: boolean;
};

export type AssignmentRound = {
	id: number;
	name: string;
	reviewers: AssignmentReviewer[];
};

type Round = { id: number; name: string };

async function conferenceRounds(conferenceId: number): Promise<Round[]> {
	return db
		.select({ id: reviewRoundTable.id, name: reviewRoundTable.name })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(eq(evaluationPlanTable.conferenceId, conferenceId))
		.orderBy(asc(reviewRoundTable.position), asc(reviewRoundTable.id));
}

function submissionAssignments(submissionId: number, roundIds: number[]) {
	return db
		.select({
			roundId: reviewTable.reviewRoundId,
			userId: reviewTable.reviewerUserId,
			name: user.name,
			email: user.email,
			status: reviewTable.status
		})
		.from(reviewTable)
		.innerJoin(user, eq(user.id, reviewTable.reviewerUserId))
		.where(
			and(eq(reviewTable.submissionId, submissionId), inArray(reviewTable.reviewRoundId, roundIds))
		);
}

async function submissionSpeakerIds(submissionId: number) {
	const speakers = await db
		.select({ userId: speakerProfileTable.userId })
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(eq(submissionSpeakerTable.submissionId, submissionId));
	return new Set(speakers.flatMap((speaker) => (speaker.userId ? [speaker.userId] : [])));
}

async function submissionTrack(submissionId: number): Promise<number | null> {
	const [submission] = await db
		.select({ trackId: submissionTable.trackId })
		.from(submissionTable)
		.where(eq(submissionTable.id, submissionId))
		.limit(1);
	return submission?.trackId ?? null;
}

async function membershipTrackRestrictions(membershipIds: number[]) {
	if (membershipIds.length === 0) return new Map<number, Set<number>>();
	const rows = await db
		.select({
			membershipId: membershipTrackTable.membershipId,
			trackId: membershipTrackTable.trackId
		})
		.from(membershipTrackTable)
		.where(inArray(membershipTrackTable.membershipId, membershipIds));
	const result = new Map<number, Set<number>>();
	for (const row of rows) {
		const tracks = result.get(row.membershipId) ?? new Set<number>();
		tracks.add(row.trackId);
		result.set(row.membershipId, tracks);
	}
	return result;
}

type Membership = Awaited<ReturnType<typeof conferenceReviewerMemberships>>[number];
type ExistingAssignment = Awaited<ReturnType<typeof submissionAssignments>>[number];

function assignmentsByRound(assignments: ExistingAssignment[]) {
	const result = new Map<number, Map<string, ExistingAssignment>>();
	for (const assignment of assignments) {
		const byUser = result.get(assignment.roundId) ?? new Map();
		byUser.set(assignment.userId, assignment);
		result.set(assignment.roundId, byUser);
	}
	return result;
}

function belongsToRound(membership: Membership, roundId: number) {
	return membership.scopeType === 'conference' || membership.scopeId === roundId;
}

function membershipAllowsTrack(
	membershipId: number,
	trackId: number | null,
	restrictions: Map<number, Set<number>>
) {
	const tracks = restrictions.get(membershipId);
	return !tracks || (trackId !== null && tracks.has(trackId));
}

function membershipIsEligible(
	membership: Membership,
	roundId: number,
	speakerIds: Set<string>,
	trackId: number | null,
	restrictions: Map<number, Set<number>>
) {
	return (
		belongsToRound(membership, roundId) &&
		!speakerIds.has(membership.userId) &&
		membershipAllowsTrack(membership.membershipId, trackId, restrictions)
	);
}

function reviewersForRound(
	round: Round,
	memberships: Membership[],
	assignments: Map<string, ExistingAssignment>,
	speakerIds: Set<string>,
	trackId: number | null,
	restrictions: Map<number, Set<number>>
) {
	const candidates = new Map<string, AssignmentReviewer>();
	for (const membership of memberships) {
		if (!membershipIsEligible(membership, round.id, speakerIds, trackId, restrictions)) continue;
		candidates.set(membership.userId, {
			userId: membership.userId,
			name: membership.name ?? membership.email,
			email: membership.email,
			status: assignments.get(membership.userId)?.status ?? null,
			eligible: true
		});
	}
	for (const assignment of assignments.values()) {
		if (candidates.has(assignment.userId)) continue;
		candidates.set(assignment.userId, {
			userId: assignment.userId,
			name: assignment.name ?? assignment.email,
			email: assignment.email,
			status: assignment.status,
			eligible: false
		});
	}
	return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The eligible reviewer pool per round, plus any existing assignment kept visible. */
export async function reviewAssignmentMatrix(
	conferenceId: number,
	submissionId: number
): Promise<AssignmentRound[]> {
	const rounds = await conferenceRounds(conferenceId);
	if (rounds.length === 0) return [];
	const roundIds = rounds.map((round) => round.id);
	const [memberships, assignments, speakerIds, trackId] = await Promise.all([
		conferenceReviewerMemberships(conferenceId, roundIds),
		submissionAssignments(submissionId, roundIds),
		submissionSpeakerIds(submissionId),
		submissionTrack(submissionId)
	]);
	const restrictions = await membershipTrackRestrictions(
		memberships.map((row) => row.membershipId)
	);
	const byRound = assignmentsByRound(assignments);
	return rounds.map((round) => ({
		...round,
		reviewers: reviewersForRound(
			round,
			memberships,
			byRound.get(round.id) ?? new Map(),
			speakerIds,
			trackId,
			restrictions
		)
	}));
}

export type AssignmentResult =
	| 'assigned'
	| 'unassigned'
	| 'unchanged'
	| 'complete'
	| 'invalid'
	/** Bulk path only: an existing recusal was left alone (not restored). */
	| 'recused';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AssignmentInput = {
	conferenceId: number;
	submissionId: number;
	roundId: number;
	reviewerUserId: string;
	assigned: boolean;
};

/** Single-cell assign restores a recusal on purpose; bulk must not. */
type AssignOptions = {
	/** When false, leave `recused` rows alone and report `recused`. Default true. */
	restoreRecused?: boolean;
};

async function validAssignmentTarget(tx: Tx, input: AssignmentInput) {
	const [[submission], [round]] = await Promise.all([
		tx
			.select({ id: submissionTable.id })
			.from(submissionTable)
			.where(
				and(
					eq(submissionTable.id, input.submissionId),
					eq(submissionTable.conferenceId, input.conferenceId)
				)
			)
			.limit(1),
		tx
			.select({ id: reviewRoundTable.id })
			.from(reviewRoundTable)
			.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
			.where(
				and(
					eq(reviewRoundTable.id, input.roundId),
					eq(evaluationPlanTable.conferenceId, input.conferenceId)
				)
			)
			.limit(1)
	]);
	return Boolean(submission && round);
}

async function eligibleMemberships(tx: Tx, input: AssignmentInput) {
	return tx
		.select({ id: membershipTable.id })
		.from(membershipTable)
		.where(
			and(
				eq(membershipTable.userId, input.reviewerUserId),
				eq(membershipTable.role, 'reviewer'),
				or(
					and(
						eq(membershipTable.scopeType, 'conference'),
						eq(membershipTable.scopeId, input.conferenceId)
					),
					and(eq(membershipTable.scopeType, 'round'), eq(membershipTable.scopeId, input.roundId))
				)
			)
		);
}

async function isSubmissionSpeaker(tx: Tx, input: AssignmentInput) {
	const [speaker] = await tx
		.select({ id: speakerProfileTable.id })
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(
			and(
				eq(submissionSpeakerTable.submissionId, input.submissionId),
				eq(speakerProfileTable.userId, input.reviewerUserId)
			)
		)
		.limit(1);
	return Boolean(speaker);
}

async function assignmentTrack(tx: Tx, submissionId: number) {
	const [submission] = await tx
		.select({ trackId: submissionTable.trackId })
		.from(submissionTable)
		.where(eq(submissionTable.id, submissionId))
		.limit(1);
	return submission;
}

async function restrictionsByMembership(tx: Tx, membershipIds: number[]) {
	const rows = await tx
		.select({
			membershipId: membershipTrackTable.membershipId,
			trackId: membershipTrackTable.trackId
		})
		.from(membershipTrackTable)
		.where(inArray(membershipTrackTable.membershipId, membershipIds));
	const result = new Map<number, number[]>();
	for (const row of rows) {
		const tracks = result.get(row.membershipId) ?? [];
		tracks.push(row.trackId);
		result.set(row.membershipId, tracks);
	}
	return result;
}

async function eligibleReviewer(tx: Tx, input: AssignmentInput) {
	const [memberships, speaker, submission] = await Promise.all([
		eligibleMemberships(tx, input),
		isSubmissionSpeaker(tx, input),
		assignmentTrack(tx, input.submissionId)
	]);
	if (speaker || !submission || memberships.length === 0) return false;
	const restrictions = await restrictionsByMembership(
		tx,
		memberships.map((row) => row.id)
	);
	return memberships.some((membership) => {
		const tracks = restrictions.get(membership.id);
		return !tracks || (submission.trackId !== null && tracks.includes(submission.trackId));
	});
}

const assignmentKey = (input: AssignmentInput) =>
	and(
		eq(reviewTable.reviewRoundId, input.roundId),
		eq(reviewTable.submissionId, input.submissionId),
		eq(reviewTable.reviewerUserId, input.reviewerUserId)
	);

async function removeAssignment(tx: Tx, input: AssignmentInput): Promise<AssignmentResult> {
	const removed = await tx
		.delete(reviewTable)
		.where(and(assignmentKey(input), ne(reviewTable.status, 'submitted')))
		.returning({ id: reviewTable.id });
	if (removed.length > 0) return 'unassigned';
	const [completed] = await tx
		.select({ id: reviewTable.id })
		.from(reviewTable)
		.where(and(assignmentKey(input), eq(reviewTable.status, 'submitted')))
		.limit(1);
	return completed ? 'complete' : 'unchanged';
}

async function addAssignment(
	tx: Tx,
	input: AssignmentInput,
	options: AssignOptions = {}
): Promise<AssignmentResult> {
	if (!(await eligibleReviewer(tx, input))) return 'invalid';

	const restoreRecused = options.restoreRecused !== false;

	if (restoreRecused) {
		// Detail-page reassign: the organizer clicked this exact cell after a recusal.
		const restored = await tx
			.update(reviewTable)
			.set({ status: 'assigned', submittedAt: null })
			.where(and(assignmentKey(input), eq(reviewTable.status, 'recused')))
			.returning({ id: reviewTable.id });
		if (restored.length > 0) return 'assigned';
	} else {
		// Bulk: never silently override a reviewer's conflict declaration.
		const [recused] = await tx
			.select({ id: reviewTable.id })
			.from(reviewTable)
			.where(and(assignmentKey(input), eq(reviewTable.status, 'recused')))
			.limit(1);
		if (recused) return 'recused';
	}

	const inserted = await tx
		.insert(reviewTable)
		.values({
			reviewRoundId: input.roundId,
			submissionId: input.submissionId,
			reviewerUserId: input.reviewerUserId
		})
		.onConflictDoNothing({
			target: [reviewTable.reviewRoundId, reviewTable.submissionId, reviewTable.reviewerUserId]
		})
		.returning({ id: reviewTable.id });
	return inserted.length > 0 ? 'assigned' : 'unchanged';
}

async function updateAssignment(
	tx: Tx,
	input: AssignmentInput,
	options: AssignOptions = {}
): Promise<AssignmentResult> {
	if (!(await validAssignmentTarget(tx, input))) return 'invalid';
	return input.assigned ? addAssignment(tx, input, options) : removeAssignment(tx, input);
}

/** Adds or removes one exact (round, submission, reviewer) assignment. */
export async function setReviewAssignment(
	conferenceId: number,
	submissionId: number,
	roundId: number,
	reviewerUserId: string,
	assigned: boolean
): Promise<AssignmentResult> {
	return db.transaction((tx) =>
		updateAssignment(tx, { conferenceId, submissionId, roundId, reviewerUserId, assigned })
	);
}

/**
 * The rounds and reviewers an organizer can pick for bulk assignment on the
 * submissions table (ABS-06).
 *
 * Unlike `reviewAssignmentMatrix`, this is not submission-scoped: speakers and
 * track allow-lists still block the write via `setReviewAssignment` / bulk assign,
 * but the picker has to list the committee before a row is chosen. Per-submission
 * matrix eligibility stays on the detail page.
 */
export async function conferenceAssignmentTargets(conferenceId: number): Promise<
	{
		id: number;
		name: string;
		reviewers: { userId: string; name: string; email: string }[];
	}[]
> {
	const rounds = await conferenceRounds(conferenceId);
	if (rounds.length === 0) return [];
	const memberships = await conferenceReviewerMemberships(
		conferenceId,
		rounds.map((round) => round.id)
	);

	return rounds.map((round) => {
		const reviewers = new Map<string, { userId: string; name: string; email: string }>();
		for (const membership of memberships) {
			if (!belongsToRound(membership, round.id)) continue;
			reviewers.set(membership.userId, {
				userId: membership.userId,
				name: membership.name ?? membership.email,
				email: membership.email
			});
		}
		return {
			id: round.id,
			name: round.name,
			reviewers: [...reviewers.values()].sort((a, b) => a.name.localeCompare(b.name))
		};
	});
}

export type AssignSkipReason =
	| 'not_on_conference'
	| 'speaker_conflict'
	| 'not_in_round'
	| 'track_restricted'
	/** Auto-distribute: the paper still needed a seat and nobody eligible was under the cap. */
	| 'pool_exhausted';

export type BulkAssignSkip = {
	submissionId: number;
	reason: AssignSkipReason;
};

export type BulkAssignResult = {
	/** Fresh assignment rows written in this call. */
	created: number;
	/** Already assigned (or already submitted) — left alone. */
	already: number;
	/** Reviewer not eligible for that submission (speaker, track, wrong conference). */
	skipped: number;
	/** Existing recusals left alone — not restored by bulk. */
	recused: number;
	/** Why each skipped id was refused — the same branches `skipped` already counted. */
	skippedItems: BulkAssignSkip[];
};

const EMPTY_BULK: BulkAssignResult = {
	created: 0,
	already: 0,
	skipped: 0,
	recused: 0,
	skippedItems: []
};

/**
 * The cause behind an `invalid` write, named the way an agent can act on it.
 *
 * `eligibleReviewer` returns a boolean; this is the same tree with the branch
 * labels left on. A cause the write path does not have (withdrawn, round window)
 * is not invented here.
 */
async function classifySkip(tx: Tx, input: AssignmentInput): Promise<AssignSkipReason> {
	if (!(await validAssignmentTarget(tx, input))) return 'not_on_conference';
	if (await isSubmissionSpeaker(tx, input)) return 'speaker_conflict';
	const memberships = await eligibleMemberships(tx, input);
	// A seat on another round of this conference still shows up in
	// `list_reviewers`. Naming that `not_on_committee` sent agents back
	// through invite_reviewer, which then said they were already on it.
	if (memberships.length === 0) return 'not_in_round';
	const submission = await assignmentTrack(tx, input.submissionId);
	if (!submission) return 'not_on_conference';
	const restrictions = await restrictionsByMembership(
		tx,
		memberships.map((row) => row.id)
	);
	const allowed = memberships.some((membership) => {
		const tracks = restrictions.get(membership.id);
		return !tracks || (submission.trackId !== null && tracks.includes(submission.trackId));
	});
	return allowed ? 'not_in_round' : 'track_restricted';
}

/**
 * Assign one reviewer to many submissions in a single transaction (ABS-06).
 *
 * Existing assignments are counted as `already` and not rewritten. Recused rows
 * stay recused and are counted separately — bulk must not override a reviewer's
 * conflict declaration without a deliberate single-cell reassign. Ineligible
 * pairs are counted as `skipped` rather than failing the whole batch — the
 * organizer still gets the ones that could land.
 */
export async function assignReviewerToSubmissions(
	conferenceId: number,
	submissionIds: number[],
	roundId: number,
	reviewerUserId: string
): Promise<BulkAssignResult> {
	return assignReviewersToSubmissions(conferenceId, submissionIds, roundId, [reviewerUserId]);
}

/**
 * Assign several reviewers to the same selection in one transaction.
 *
 * Same rules as the one-reviewer path, applied to every pair. A speaker conflict
 * on reviewer A does not block reviewer B on that row.
 */
export async function assignReviewersToSubmissions(
	conferenceId: number,
	submissionIds: number[],
	roundId: number,
	reviewerUserIds: string[]
): Promise<BulkAssignResult> {
	const ids = [...new Set(submissionIds.filter((id) => Number.isInteger(id) && id > 0))];
	const reviewers = [...new Set(reviewerUserIds.filter((id) => id !== ''))];
	if (ids.length === 0 || reviewers.length === 0) return { ...EMPTY_BULK };

	return db.transaction(async (tx) => {
		let created = 0;
		let already = 0;
		let skipped = 0;
		let recused = 0;
		const skippedItems: BulkAssignSkip[] = [];

		for (const reviewerUserId of reviewers) {
			for (const submissionId of ids) {
				const input = {
					conferenceId,
					submissionId,
					roundId,
					reviewerUserId,
					assigned: true as const
				};
				const result = await updateAssignment(tx, input, { restoreRecused: false });
				if (result === 'assigned') created += 1;
				else if (result === 'unchanged' || result === 'complete') already += 1;
				else if (result === 'recused') recused += 1;
				else {
					skipped += 1;
					skippedItems.push({ submissionId, reason: await classifySkip(tx, input) });
				}
			}
		}

		return { created, already, skipped, recused, skippedItems };
	});
}

export type DistributeOptions = {
	/** Target number of active (non-recused) reviewers on each selected submission. */
	reviewsPerSubmission: number;
	/** Max active assignments a reviewer may hold in this round after the run. */
	capPerReviewer: number;
	/**
	 * When non-empty, only these reviewers are candidates. Empty (the default)
	 * means the whole committee — the checkboxes on the bulk bar, if any, are
	 * the pool Auto-distribute fills from.
	 */
	reviewerUserIds?: string[];
};

type SubmissionSeat = { userId: string; status: Review['status'] };

type DistributeSnapshot = {
	onConference: Map<number, { id: number; trackId: number | null }>;
	speakersBySubmission: Map<number, Set<string>>;
	existingBySubmission: Map<number, SubmissionSeat[]>;
	load: Map<string, number>;
};

type DistributeAcc = BulkAssignResult & { load: Map<string, number> };

type FillInput = {
	conferenceId: number;
	submissionId: number;
	roundId: number;
	reviewsPerSubmission: number;
	pool: Membership[];
	trackId: number | null;
	seats: SubmissionSeat[];
	speakers: Set<string>;
	restrictions: Map<number, Set<number>>;
	capPerReviewer: number;
};

type RunDistributeArgs = {
	conferenceId: number;
	roundId: number;
	ids: number[];
	reviewsPerSubmission: number;
	capPerReviewer: number;
	pool: Membership[];
	restrictions: Map<number, Set<number>>;
	snapshot: DistributeSnapshot;
};

function submissionsOnConference(conferenceId: number, ids: number[]) {
	return db
		.select({ id: submissionTable.id, trackId: submissionTable.trackId })
		.from(submissionTable)
		.where(and(eq(submissionTable.conferenceId, conferenceId), inArray(submissionTable.id, ids)));
}

function speakerRowsFor(ids: number[]) {
	return db
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			userId: speakerProfileTable.userId
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, ids));
}

function seatsForRound(roundId: number, ids: number[]) {
	return db
		.select({
			submissionId: reviewTable.submissionId,
			userId: reviewTable.reviewerUserId,
			status: reviewTable.status
		})
		.from(reviewTable)
		.where(and(eq(reviewTable.reviewRoundId, roundId), inArray(reviewTable.submissionId, ids)));
}

function activeLoadForRound(roundId: number) {
	return db
		.select({
			userId: reviewTable.reviewerUserId,
			assigned: count()
		})
		.from(reviewTable)
		.where(and(eq(reviewTable.reviewRoundId, roundId), ne(reviewTable.status, 'recused')))
		.groupBy(reviewTable.reviewerUserId);
}

async function loadDistributeSnapshot(
	conferenceId: number,
	ids: number[],
	roundId: number
): Promise<DistributeSnapshot> {
	const [submissions, speakerRows, seats, loadRows] = await Promise.all([
		submissionsOnConference(conferenceId, ids),
		speakerRowsFor(ids),
		seatsForRound(roundId, ids),
		activeLoadForRound(roundId)
	]);
	const speakersBySubmission = new Map<number, Set<string>>();
	for (const row of speakerRows) {
		if (!row.userId) continue;
		const set = speakersBySubmission.get(row.submissionId) ?? new Set();
		set.add(row.userId);
		speakersBySubmission.set(row.submissionId, set);
	}
	const existingBySubmission = new Map<number, SubmissionSeat[]>();
	for (const row of seats) {
		const list = existingBySubmission.get(row.submissionId) ?? [];
		list.push({ userId: row.userId, status: row.status });
		existingBySubmission.set(row.submissionId, list);
	}
	return {
		onConference: new Map(submissions.map((row) => [row.id, row])),
		speakersBySubmission,
		existingBySubmission,
		load: new Map(loadRows.map((row) => [row.userId, Number(row.assigned)]))
	};
}

/** One row per user — a person can sit conference-scoped and round-scoped. */
function uniqueMembershipsByUser(memberships: Membership[]): Membership[] {
	const byUser = new Map<string, Membership>();
	for (const membership of memberships) byUser.set(membership.userId, membership);
	return [...byUser.values()];
}

function distributePool(memberships: Membership[], reviewerUserIds: string[]): Membership[] {
	const unique = uniqueMembershipsByUser(memberships);
	if (reviewerUserIds.length === 0) return unique;
	const wanted = new Set(reviewerUserIds);
	return unique.filter((membership) => wanted.has(membership.userId));
}

function parseDistributeInput(submissionIds: number[], options: DistributeOptions) {
	const ids = [...new Set(submissionIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
		(a, b) => a - b
	);
	const { reviewsPerSubmission, capPerReviewer } = options;
	const reviewerUserIds = [...new Set((options.reviewerUserIds ?? []).filter((id) => id !== ''))];
	if (
		ids.length === 0 ||
		!Number.isInteger(reviewsPerSubmission) ||
		reviewsPerSubmission < 1 ||
		!Number.isInteger(capPerReviewer) ||
		capPerReviewer < 1
	) {
		return null;
	}
	return { ids, reviewsPerSubmission, capPerReviewer, reviewerUserIds };
}

async function roundOnConference(tx: Tx, conferenceId: number, roundId: number) {
	const [round] = await tx
		.select({ id: reviewRoundTable.id })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(eq(reviewRoundTable.id, roundId), eq(evaluationPlanTable.conferenceId, conferenceId))
		)
		.limit(1);
	return Boolean(round);
}

function eligibleDistributeCandidates(
	pool: Membership[],
	trackId: number | null,
	active: Set<string>,
	recusedIds: Set<string>,
	speakers: Set<string>,
	restrictions: Map<number, Set<number>>,
	load: Map<string, number>,
	capPerReviewer: number
) {
	return pool
		.filter((membership) => {
			if (active.has(membership.userId) || recusedIds.has(membership.userId)) return false;
			if (speakers.has(membership.userId)) return false;
			if (!membershipAllowsTrack(membership.membershipId, trackId, restrictions)) return false;
			return (load.get(membership.userId) ?? 0) < capPerReviewer;
		})
		.sort((a, b) => {
			const loadDelta = (load.get(a.userId) ?? 0) - (load.get(b.userId) ?? 0);
			return loadDelta !== 0 ? loadDelta : a.userId.localeCompare(b.userId);
		});
}

function applyFillResult(
	result: AssignmentResult,
	userId: string,
	acc: DistributeAcc
): 'filled' | 'other' {
	if (result === 'assigned') {
		acc.created += 1;
		acc.load.set(userId, (acc.load.get(userId) ?? 0) + 1);
		return 'filled';
	}
	if (result === 'unchanged' || result === 'complete') {
		acc.already += 1;
		return 'filled';
	}
	if (result === 'recused') acc.recused += 1;
	return 'other';
}

function seatUserIds(seats: SubmissionSeat[], status: Review['status'] | 'active') {
	return new Set(
		seats
			.filter((seat) => (status === 'active' ? seat.status !== 'recused' : seat.status === status))
			.map((seat) => seat.userId)
	);
}

function fillArgs(
	args: RunDistributeArgs,
	submissionId: number,
	trackId: number | null
): FillInput {
	return {
		conferenceId: args.conferenceId,
		submissionId,
		roundId: args.roundId,
		reviewsPerSubmission: args.reviewsPerSubmission,
		pool: args.pool,
		trackId,
		seats: args.snapshot.existingBySubmission.get(submissionId) ?? [],
		speakers: args.snapshot.speakersBySubmission.get(submissionId) ?? new Set(),
		restrictions: args.restrictions,
		capPerReviewer: args.capPerReviewer
	};
}

function resultOf(acc: DistributeAcc): BulkAssignResult {
	return {
		created: acc.created,
		already: acc.already,
		skipped: acc.skipped,
		recused: acc.recused,
		skippedItems: acc.skippedItems
	};
}

async function fillSubmissionSeats(tx: Tx, input: FillInput, acc: DistributeAcc) {
	const active = seatUserIds(input.seats, 'active');
	const recusedIds = seatUserIds(input.seats, 'recused');
	acc.already += Math.min(active.size, input.reviewsPerSubmission);
	const need = input.reviewsPerSubmission - active.size;
	if (need <= 0) return;

	const candidates = eligibleDistributeCandidates(
		input.pool,
		input.trackId,
		active,
		recusedIds,
		input.speakers,
		input.restrictions,
		acc.load,
		input.capPerReviewer
	);
	let filled = 0;
	for (const membership of candidates) {
		if (filled >= need) break;
		const assignment = {
			conferenceId: input.conferenceId,
			submissionId: input.submissionId,
			roundId: input.roundId,
			reviewerUserId: membership.userId,
			assigned: true as const
		};
		const result = await updateAssignment(tx, assignment, { restoreRecused: false });
		if (applyFillResult(result, membership.userId, acc) === 'filled') {
			filled += 1;
			active.add(membership.userId);
		}
	}
	if (need - filled > 0) {
		acc.skipped += need - filled;
		acc.skippedItems.push({ submissionId: input.submissionId, reason: 'pool_exhausted' });
	}
}

async function runDistribute(tx: Tx, args: RunDistributeArgs): Promise<BulkAssignResult> {
	if (!(await roundOnConference(tx, args.conferenceId, args.roundId))) return { ...EMPTY_BULK };
	const acc: DistributeAcc = {
		created: 0,
		already: 0,
		skipped: 0,
		recused: 0,
		skippedItems: [],
		load: args.snapshot.load
	};
	for (const submissionId of args.ids) {
		const submission = args.snapshot.onConference.get(submissionId);
		if (!submission) {
			acc.skipped += 1;
			acc.skippedItems.push({ submissionId, reason: 'not_on_conference' });
			continue;
		}
		await fillSubmissionSeats(tx, fillArgs(args, submissionId, submission.trackId), acc);
	}
	return resultOf(acc);
}

/**
 * Fill each selected submission up to N reviewers, load-balancing under a cap.
 *
 * Recusals, speaker conflicts and track allow-lists are never overridden — the
 * same gates as bulk assign. Existing active seats count toward N, so a second
 * run is a no-op on papers that are already full. Reviewers at the cap are
 * skipped rather than overflowing. The pool is one row per user; a checked
 * subset, when present, replaces the whole committee.
 */
export async function autoDistributeReviews(
	conferenceId: number,
	submissionIds: number[],
	roundId: number,
	options: DistributeOptions
): Promise<BulkAssignResult> {
	const parsed = parseDistributeInput(submissionIds, options);
	if (!parsed) return { ...EMPTY_BULK };

	const memberships = await conferenceReviewerMemberships(conferenceId, [roundId]);
	const restrictions = await membershipTrackRestrictions(
		memberships.map((row) => row.membershipId)
	);
	const pool = distributePool(
		memberships.filter((membership) => belongsToRound(membership, roundId)),
		parsed.reviewerUserIds
	);
	const snapshot = await loadDistributeSnapshot(conferenceId, parsed.ids, roundId);

	return db.transaction((tx) =>
		runDistribute(tx, {
			conferenceId,
			roundId,
			ids: parsed.ids,
			reviewsPerSubmission: parsed.reviewsPerSubmission,
			capPerReviewer: parsed.capPerReviewer,
			pool,
			restrictions,
			snapshot
		})
	);
}

export type ReviewerProgress = {
	userId: string;
	name: string;
	email: string;
	assigned: number;
	submitted: number;
	outstanding: number;
	reminderStatus: EmailLog['status'] | null;
};

/** Active assignments grouped by reviewer, rather than by submission. */
export async function reviewerProgress(conferenceId: number): Promise<ReviewerProgress[]> {
	const rows = await db
		.select({
			userId: reviewTable.reviewerUserId,
			name: user.name,
			email: user.email,
			assigned: count(),
			submitted: sql<number>`count(*) filter (where ${reviewTable.status} = 'submitted')`
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.innerJoin(user, eq(user.id, reviewTable.reviewerUserId))
		.where(
			and(eq(evaluationPlanTable.conferenceId, conferenceId), ne(reviewTable.status, 'recused'))
		)
		.groupBy(reviewTable.reviewerUserId, user.name, user.email)
		.orderBy(asc(user.name), asc(user.email));

	const emails = rows.map((row) => row.email);
	const reminders =
		emails.length === 0
			? []
			: await db
					.select({ toEmail: emailLogTable.toEmail, status: emailLogTable.status })
					.from(emailLogTable)
					.where(
						and(
							eq(emailLogTable.conferenceId, conferenceId),
							eq(emailLogTable.template, 'review_reminder'),
							inArray(emailLogTable.toEmail, emails)
						)
					)
					.orderBy(asc(emailLogTable.id));
	const latest = new Map(reminders.map((reminder) => [reminder.toEmail, reminder.status]));

	return rows.map((row) => {
		const assigned = Number(row.assigned);
		const submitted = Number(row.submitted);
		return {
			userId: row.userId,
			name: row.name ?? row.email,
			email: row.email,
			assigned,
			submitted,
			outstanding: assigned - submitted,
			reminderStatus: latest.get(row.email) ?? null
		};
	});
}

export type ReminderResult = 'queued' | 'already_queued' | 'nothing_outstanding' | 'no_email';

async function queueReviewReminderRow(
	conference: Conference,
	reviewerUserId: string
): Promise<ReminderResult> {
	return db.transaction(async (tx) => {
		const [reviewer] = await tx
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, reviewerUserId))
			.limit(1);
		if (!reviewer?.email) return 'no_email';

		const [pending] = await tx
			.select({ count: count() })
			.from(reviewTable)
			.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
			.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
			.where(
				and(
					eq(evaluationPlanTable.conferenceId, conference.id),
					eq(reviewTable.reviewerUserId, reviewerUserId),
					eq(reviewTable.status, 'assigned')
				)
			);
		const outstanding = Number(pending?.count ?? 0);
		if (outstanding === 0) return 'nothing_outstanding';

		const [existing] = await tx
			.select({ id: emailLogTable.id })
			.from(emailLogTable)
			.where(
				and(
					eq(emailLogTable.conferenceId, conference.id),
					eq(emailLogTable.toEmail, reviewer.email),
					eq(emailLogTable.template, 'review_reminder'),
					inArray(emailLogTable.status, ['queued', 'sent'])
				)
			)
			.limit(1);
		if (existing) return 'already_queued';

		await tx.insert(emailLogTable).values({
			conferenceId: conference.id,
			toEmail: reviewer.email,
			template: 'review_reminder',
			subject: `${outstanding} ${conference.name} review${outstanding === 1 ? '' : 's'} still waiting`,
			bodyPreview: `You still have ${outstanding} assigned review${outstanding === 1 ? '' : 's'} to submit for ${conference.name}. Open /review/${conference.slug} to continue.`,
			status: 'queued',
			relatedType: 'reviewer'
		});
		return 'queued';
	});
}

export type BulkReminderTally = Record<ReminderResult, number>;

/**
 * Reminds a chosen set of reviewers in one go (ABS-09).
 *
 * The per-reviewer rules are unchanged and stay in `queueReviewReminderRow`: a
 * reviewer with nothing outstanding, no address, or a reminder already waiting is
 * skipped rather than mailed twice. What is new is that the organizer no longer
 * pays one page reload per person on a committee of twenty.
 *
 * Rows are written one at a time and dispatched once at the end: dispatch talks to
 * the mail provider, and doing that inside the loop would turn one slow send into
 * N slow sends while the organizer waits. The tally is returned in full rather than
 * as a single number, because "sent 3" and "sent 3, skipped 4" are different answers
 * and the second one is the one that stops a second click.
 */
export async function queueReviewReminders(
	conference: Conference,
	reviewerUserIds: string[]
): Promise<BulkReminderTally> {
	const tally: BulkReminderTally = {
		queued: 0,
		already_queued: 0,
		nothing_outstanding: 0,
		no_email: 0
	};

	for (const reviewerUserId of new Set(reviewerUserIds)) {
		tally[await queueReviewReminderRow(conference, reviewerUserId)] += 1;
	}

	if (tally.queued > 0) await dispatchConferenceEmails(conference.id);
	return tally;
}
