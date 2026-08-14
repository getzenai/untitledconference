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
import { and, eq, isNull, sql } from 'drizzle-orm';
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
