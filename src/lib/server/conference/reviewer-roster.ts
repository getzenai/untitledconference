/**
 * Who is on this conference's review committee.
 *
 * `membership` with `role = 'reviewer'` is the only thing that makes someone a
 * reviewer: `reviewerMemberships` (review-management.ts) and the reviewer's own
 * queue (reviewer.ts) both read it and nothing else. The demo seed writes those
 * rows directly, so the seeded conference has a committee — but an organizer
 * starting a conference of their own had no way to make one, which left the
 * assignment matrix permanently empty for everybody outside the seed.
 *
 * Memberships written here are scoped to the conference rather than to a round.
 * Both read paths already accept either scope, and a committee that has to be
 * re-stated for every round is a chore with no question behind it.
 *
 * Existing accounts become reviewers immediately. Unknown addresses go through
 * Better Auth's organization invitation flow; accepting that invite writes the
 * conference membership, so a pending invitation never masquerades as a reviewer.
 */
import { db } from '$lib/server/db';
import { invitation, user } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	membershipTable,
	membershipTrackTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import {
	evaluationPlanTable,
	reviewRoundTable,
	reviewTable
} from '$lib/server/db/conference/review-schema';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { conferenceReviewerMemberships } from './reviewer-memberships';

export type CommitteeMember = {
	membershipId: number;
	userId: string;
	name: string;
	email: string;
	role: 'reviewer';
	conferenceManaged: boolean;
	rounds: string[];
	trackIds: number[];
	tracks: string[];
	assigned: number;
	submitted: number;
	outstanding: number;
};

export type PendingReviewerInvitation = { id: string; email: string; expiresAt: Date };

export type ReviewerAddResult =
	| { ok: true; name: string }
	| { ok: false; reason: 'invalid' | 'no_account' | 'already'; message: string };

/** `user.name` is nullable; the address is who they are when it is not set. */
function displayName(name: string | null, email: string): string {
	return name?.trim() || email;
}

async function committeeRounds(conferenceId: number) {
	return db
		.select({ id: reviewRoundTable.id, name: reviewRoundTable.name })
		.from(reviewRoundTable)
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(eq(evaluationPlanTable.conferenceId, conferenceId))
		.orderBy(asc(reviewRoundTable.position), asc(reviewRoundTable.id));
}

async function committeeTrackRows(conferenceId: number, membershipIds: number[]) {
	return db
		.select({
			membershipId: membershipTrackTable.membershipId,
			trackId: trackTable.id,
			track: trackTable.name
		})
		.from(membershipTrackTable)
		.innerJoin(trackTable, eq(trackTable.id, membershipTrackTable.trackId))
		.where(
			and(
				inArray(membershipTrackTable.membershipId, membershipIds),
				eq(trackTable.conferenceId, conferenceId)
			)
		)
		.orderBy(asc(trackTable.position), asc(trackTable.id));
}

async function committeeAssignmentRows(conferenceId: number, userIds: string[]) {
	return db
		.select({
			userId: reviewTable.reviewerUserId,
			assigned: count(),
			submitted: count(reviewTable.submittedAt)
		})
		.from(reviewTable)
		.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, reviewTable.reviewRoundId))
		.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
		.where(
			and(
				eq(evaluationPlanTable.conferenceId, conferenceId),
				inArray(reviewTable.reviewerUserId, userIds),
				ne(reviewTable.status, 'recused')
			)
		)
		.groupBy(reviewTable.reviewerUserId);
}

type CommitteeRow = Awaited<ReturnType<typeof conferenceReviewerMemberships>>[number];
type TrackRow = Awaited<ReturnType<typeof committeeTrackRows>>[number];
type AssignmentRow = Awaited<ReturnType<typeof committeeAssignmentRows>>[number];

function groupByUser(rows: CommitteeRow[]): CommitteeRow[][] {
	const rowsByUser = new Map<string, CommitteeRow[]>();
	for (const row of rows) {
		const memberships = rowsByUser.get(row.userId) ?? [];
		memberships.push(row);
		rowsByUser.set(row.userId, memberships);
	}
	return [...rowsByUser.values()];
}

function trackAccess(
	memberships: CommitteeRow[],
	tracksByMembership: Map<number, { ids: number[]; names: string[] }>
) {
	const trackIds = new Set<number>();
	const tracks = new Set<string>();
	for (const membership of memberships) {
		const restriction = tracksByMembership.get(membership.membershipId);
		for (const id of restriction?.ids ?? []) trackIds.add(id);
		for (const name of restriction?.names ?? []) tracks.add(name);
	}
	return { trackIds: [...trackIds], tracks: [...tracks] };
}

function roundLabels(memberships: CommitteeRow[], roundNames: Map<number, string>): string[] {
	return memberships
		.filter((membership) => membership.scopeType === 'round')
		.sort(
			(a, b) =>
				[...roundNames.keys()].indexOf(a.scopeId) - [...roundNames.keys()].indexOf(b.scopeId)
		)
		.flatMap((membership) => {
			const name = roundNames.get(membership.scopeId);
			return name ? [name] : [];
		});
}

function committeeMember(
	memberships: CommitteeRow[],
	roundNames: Map<number, string>,
	tracksByMembership: Map<number, { ids: number[]; names: string[] }>,
	assignmentsByUser: Map<string, AssignmentRow>
): CommitteeMember {
	const conferenceSeat = memberships.find((row) => row.scopeType === 'conference');
	const row = conferenceSeat ?? memberships[0];
	const access = trackAccess(conferenceSeat ? [conferenceSeat] : memberships, tracksByMembership);
	const progress = assignmentsByUser.get(row.userId);
	const assigned = Number(progress?.assigned ?? 0);
	const submitted = Number(progress?.submitted ?? 0);
	return {
		membershipId: row.membershipId,
		userId: row.userId,
		name: displayName(row.name, row.email),
		email: row.email,
		role: 'reviewer',
		conferenceManaged: Boolean(conferenceSeat),
		rounds: roundLabels(memberships, roundNames),
		...access,
		assigned,
		submitted,
		outstanding: assigned - submitted
	};
}

function assembleCommittee(
	rows: CommitteeRow[],
	roundNames: Map<number, string>,
	restrictedTracks: TrackRow[],
	assignments: AssignmentRow[]
): CommitteeMember[] {
	const tracksByMembership = new Map<number, { ids: number[]; names: string[] }>();
	for (const row of restrictedTracks) {
		const entry = tracksByMembership.get(row.membershipId) ?? { ids: [], names: [] };
		entry.ids.push(row.trackId);
		entry.names.push(row.track);
		tracksByMembership.set(row.membershipId, entry);
	}
	const assignmentsByUser = new Map(assignments.map((row) => [row.userId, row]));
	return groupByUser(rows).map((memberships) =>
		committeeMember(memberships, roundNames, tracksByMembership, assignmentsByUser)
	);
}

/** The conference- and round-scoped committee, by name, access and current workload. */
export async function committee(conferenceId: number): Promise<CommitteeMember[]> {
	const rounds = await committeeRounds(conferenceId);
	const rows = await conferenceReviewerMemberships(
		conferenceId,
		rounds.map((round) => round.id)
	);
	if (rows.length === 0) return [];
	const [restrictedTracks, assignments] = await Promise.all([
		committeeTrackRows(
			conferenceId,
			rows.map((row) => row.membershipId)
		),
		committeeAssignmentRows(
			conferenceId,
			rows.map((row) => row.userId)
		)
	]);
	return assembleCommittee(
		rows,
		new Map(rounds.map((round) => [round.id, round.name])),
		restrictedTracks,
		assignments
	).sort((a, b) => a.name.localeCompare(b.name));
}

export async function reviewerTracks(conferenceId: number) {
	return db
		.select({ id: trackTable.id, name: trackTable.name })
		.from(trackTable)
		.where(eq(trackTable.conferenceId, conferenceId))
		.orderBy(asc(trackTable.position), asc(trackTable.id));
}

export async function pendingReviewerInvitations(
	conferenceId: number
): Promise<PendingReviewerInvitation[]> {
	return db
		.select({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt })
		.from(invitation)
		.where(and(eq(invitation.conferenceId, conferenceId), eq(invitation.status, 'pending')))
		.orderBy(asc(invitation.expiresAt));
}

/** Turns the accepted auth invitation into the conference permission it promised. */
export async function acceptReviewerInvitation(
	conferenceId: number,
	organizationId: string,
	userId: string
): Promise<boolean> {
	const [conference] = await db
		.select({ id: conferenceTable.id })
		.from(conferenceTable)
		.where(
			and(eq(conferenceTable.id, conferenceId), eq(conferenceTable.organizationId, organizationId))
		)
		.limit(1);
	if (!conference) return false;

	const [existing] = await db
		.select({ id: membershipTable.id })
		.from(membershipTable)
		.where(
			and(
				eq(membershipTable.userId, userId),
				eq(membershipTable.role, 'reviewer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conferenceId)
			)
		)
		.limit(1);
	if (existing) return true;

	await db.insert(membershipTable).values({
		userId,
		role: 'reviewer',
		scopeType: 'conference',
		scopeId: conferenceId
	});
	return true;
}

export type ReviewerTrackResult = { ok: true } | { ok: false; message: string };

/** Replaces one reviewer's allow-list. No rows deliberately means every track. */
export async function setReviewerTracks(
	conferenceId: number,
	membershipId: number,
	mode: 'all' | 'selected',
	trackIds: number[]
): Promise<ReviewerTrackResult> {
	const selected = [...new Set(trackIds)];
	if (mode === 'selected' && selected.length === 0) {
		return { ok: false, message: 'Choose at least one track, or select All tracks.' };
	}

	return db.transaction(async (tx) => {
		const [membership] = await tx
			.select({ id: membershipTable.id })
			.from(membershipTable)
			.where(
				and(
					eq(membershipTable.id, membershipId),
					eq(membershipTable.role, 'reviewer'),
					eq(membershipTable.scopeType, 'conference'),
					eq(membershipTable.scopeId, conferenceId)
				)
			)
			.limit(1);
		if (!membership) return { ok: false, message: 'Unknown committee member.' };

		if (mode === 'selected') {
			const valid = await tx
				.select({ id: trackTable.id })
				.from(trackTable)
				.where(and(eq(trackTable.conferenceId, conferenceId), inArray(trackTable.id, selected)));
			if (valid.length !== selected.length) {
				return { ok: false, message: 'One of those tracks does not belong to this conference.' };
			}
		}

		await tx
			.delete(membershipTrackTable)
			.where(eq(membershipTrackTable.membershipId, membershipId));
		if (mode === 'selected') {
			await tx
				.insert(membershipTrackTable)
				.values(selected.map((trackId) => ({ membershipId, trackId })));
		}
		return { ok: true };
	});
}

export async function addReviewer(
	conferenceId: number,
	rawEmail: string
): Promise<ReviewerAddResult> {
	const email = rawEmail.trim();
	if (!email) return { ok: false, reason: 'invalid', message: 'Enter an email address.' };

	const [account] = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);

	// The page action turns this typed result into a Better Auth invitation. Keeping
	// pending invitations out of `membership` prevents them from appearing assignable.
	if (!account) {
		return {
			ok: false,
			reason: 'no_account',
			message: `Nobody signed up as ${email} yet. They need an account before they can review.`
		};
	}

	const [existing] = await db
		.select({ id: membershipTable.id })
		.from(membershipTable)
		.where(
			and(
				eq(membershipTable.userId, account.id),
				eq(membershipTable.role, 'reviewer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conferenceId)
			)
		)
		.limit(1);

	const shown = displayName(account.name, email);

	if (existing) {
		return { ok: false, reason: 'already', message: `${shown} is already on the committee.` };
	}

	await db.insert(membershipTable).values({
		userId: account.id,
		role: 'reviewer',
		scopeType: 'conference',
		scopeId: conferenceId
	});

	return { ok: true, name: shown };
}

/**
 * Takes someone off the committee.
 *
 * Their existing `review` rows are deliberately left alone: those carry scores and
 * comments the organizer's decision picture is built on, and dropping a membership
 * is a statement about future assignments, not a retraction of work already done.
 */
export async function removeReviewer(
	conferenceId: number,
	membershipId: number
): Promise<{ ok: boolean }> {
	const deleted = await db
		.delete(membershipTable)
		.where(
			and(
				eq(membershipTable.id, membershipId),
				eq(membershipTable.role, 'reviewer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conferenceId)
			)
		)
		.returning({ id: membershipTable.id });

	return { ok: deleted.length > 0 };
}
