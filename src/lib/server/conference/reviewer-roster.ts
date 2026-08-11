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
 * A reviewer must already have an account. Matching on the account's address
 * rather than inviting a stranger is the same call `speaker-portal.ts` documents:
 * a row nobody can sign in as is a roster entry that will never review anything,
 * and it reads as done.
 */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { membershipTable } from '$lib/server/db/conference/conference-schema';
import { and, asc, eq } from 'drizzle-orm';

export type CommitteeMember = {
	membershipId: number;
	userId: string;
	name: string;
	email: string;
};

export type ReviewerAddResult =
	| { ok: true; name: string }
	| { ok: false; reason: 'invalid' | 'no_account' | 'already'; message: string };

/** `user.name` is nullable; the address is who they are when it is not set. */
function displayName(name: string | null, email: string): string {
	return name?.trim() || email;
}

/** The conference-scoped committee, by name. */
export async function committee(conferenceId: number): Promise<CommitteeMember[]> {
	const rows = await db
		.select({
			membershipId: membershipTable.id,
			userId: membershipTable.userId,
			name: user.name,
			email: user.email
		})
		.from(membershipTable)
		.innerJoin(user, eq(user.id, membershipTable.userId))
		.where(
			and(
				eq(membershipTable.role, 'reviewer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conferenceId)
			)
		)
		.orderBy(asc(user.name), asc(membershipTable.id));

	return rows.map((row) => ({ ...row, name: displayName(row.name, row.email) }));
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

	// Said plainly rather than stored hopefully: without an account there is nobody
	// to assign, and a pending row would read like the committee had grown.
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
