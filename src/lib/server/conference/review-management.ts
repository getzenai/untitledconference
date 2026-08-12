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

export type BulkAssignResult = {
	/** Fresh assignment rows written in this call. */
	created: number;
	/** Already assigned (or already submitted) — left alone. */
	already: number;
	/** Reviewer not eligible for that submission (speaker, track, wrong conference). */
	skipped: number;
	/** Existing recusals left alone — not restored by bulk. */
	recused: number;
};

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
	const ids = [...new Set(submissionIds.filter((id) => Number.isInteger(id) && id > 0))];
	if (ids.length === 0) return { created: 0, already: 0, skipped: 0, recused: 0 };

	return db.transaction(async (tx) => {
		let created = 0;
		let already = 0;
		let skipped = 0;
		let recused = 0;

		for (const submissionId of ids) {
			const result = await updateAssignment(
				tx,
				{
					conferenceId,
					submissionId,
					roundId,
					reviewerUserId,
					assigned: true
				},
				{ restoreRecused: false }
			);
			if (result === 'assigned') created += 1;
			else if (result === 'unchanged' || result === 'complete') already += 1;
			else if (result === 'recused') recused += 1;
			else skipped += 1;
		}

		return { created, already, skipped, recused };
	});
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

/** Queues one reminder and ignores a repeated click while a successful row exists. */
export async function queueReviewReminder(
	conference: Conference,
	reviewerUserId: string
): Promise<ReminderResult> {
	const result = await queueReviewReminderRow(conference, reviewerUserId);
	if (result === 'queued') await dispatchConferenceEmails(conference.id);
	return result;
}
