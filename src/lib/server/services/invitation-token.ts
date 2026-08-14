/**
 * Resolve an invitation token to the invited email — by exact match only.
 *
 * The registration page needs the email that belongs to a token so it can
 * prefill it and sign the person in after they choose a password. It used to
 * find it with `like(reset_link, '%/reset-password/' + token + '?%')`, which
 * handed the caller Postgres LIKE metacharacters: `?token=%` matched any
 * pending invitation, and longer patterns read the stored token back one
 * character at a time. Unauthenticated, unthrottled (#395).
 *
 * The token is Better Auth's own reset token, and Better Auth already stores
 * it under an exact key: `verification.identifier = 'reset-password:<token>'`
 * with the user id as the value (`better-auth/dist/api/routes/password.mjs`).
 * Looking it up there is an equality comparison — a `%` in the token is just a
 * percent sign that matches nothing — and it needs no copy of the token
 * anywhere else.
 */
import { db } from '$lib/server/db';
import { systemInvitation, user, verification } from '$lib/server/db/auth-schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { normalizeEmail } from './email-address';

/** Better Auth's key prefix for password-reset tokens. */
const RESET_TOKEN_PREFIX = 'reset-password:';

/**
 * The email a valid, unexpired invitation token belongs to, or null.
 *
 * Null covers every failure the caller may not distinguish: unknown token,
 * expired token, a reset token for someone with no pending invitation. The
 * page turns all of them into the same "this link is not valid" screen.
 */
export async function resolveInvitationEmail(
	token: string,
	now = new Date()
): Promise<string | null> {
	if (!token) return null;

	const [row] = await db
		.select({ email: user.email, expiresAt: verification.expiresAt })
		.from(verification)
		.innerJoin(user, eq(user.id, verification.value))
		.where(eq(verification.identifier, `${RESET_TOKEN_PREFIX}${token}`))
		.limit(1);

	if (!row || row.expiresAt <= now) return null;

	// A reset token proves who asked; a pending invitation proves this page is
	// the right one. Someone resetting a normal password has no invitation row
	// and belongs on /reset-password, not here.
	//
	// Compared case-insensitively although both sides are stored lowercased
	// (Better Auth for `user.email`, `normalizeEmail` for ours, migration 0019
	// for the rows written before it): the cost is a scan of a table with one
	// row per pending invitation, and the failure it prevents is a dead
	// invitation link, which nobody can debug from the outside.
	const [invitation] = await db
		.select({ id: systemInvitation.id })
		.from(systemInvitation)
		.where(
			and(
				sql`lower(${systemInvitation.email}) = ${normalizeEmail(row.email)}`,
				isNull(systemInvitation.acceptedAt)
			)
		)
		.limit(1);

	return invitation ? row.email : null;
}

/**
 * Drop every live password-reset token for this user.
 *
 * Better Auth keeps each `reset-password:<token>` row until its own
 * `expiresAt`. Regenerating an invitation therefore used to leave the
 * previous link working — fine if the mail was lost, wrong if the link
 * leaked. The regenerate button means the second thing (#401): the old
 * token has to die before the new one is minted.
 *
 * Only `reset-password:` rows. Email-verification and anything else that
 * happens to store this user id as `value` stay. The prefix is matched
 * in process, not with SQL LIKE: this file exists because a user-supplied
 * LIKE pattern on this table was an oracle.
 */
export async function invalidatePasswordResetTokens(userId: string): Promise<void> {
	const rows = await db
		.select({ id: verification.id, identifier: verification.identifier })
		.from(verification)
		.where(eq(verification.value, userId));

	const ids = rows
		.filter((row) => row.identifier.startsWith(RESET_TOKEN_PREFIX))
		.map((row) => row.id);

	if (ids.length === 0) return;

	await db.delete(verification).where(inArray(verification.id, ids));
}

/**
 * Same as `invalidatePasswordResetTokens`, looked up by the address the
 * admin form sent. No-op when no user has that email — the caller still
 * has to create the new token, and Better Auth already treats an unknown
 * address as a silent success.
 */
export async function invalidatePasswordResetTokensForEmail(rawEmail: string): Promise<void> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, normalizeEmail(rawEmail)))
		.limit(1);

	if (!row) return;
	await invalidatePasswordResetTokens(row.id);
}
