/**
 * The three sidebar flags, derived from relations the user already has (#239).
 *
 * This is a *presentation* question, not a permission boundary. Every destination
 * behind these flags guards itself — `requireOrganizer` and `requireReviewer` still
 * answer 404 to anyone who types the URL, and `/contacts` still filters by the seats
 * the user holds. Hiding a link the user cannot use is politeness; it is not, and
 * must never be mistaken for, the guard.
 *
 * The rules mirror the loaders they hide, and that is the whole point of putting them
 * next to each other:
 *
 * - **Conferences** — `organizedConferences` reads two sources, an org-wide
 *   `owner`/`admin` seat and a scoped `organizer` membership. Either one earns
 *   the link.
 * - **Contacts** — `organizerOrganizationIds` reads the org-wide seat *alone*.
 *   A scoped conference organizer gets an empty directory today, so they do not
 *   get the link.
 * - **Reviewing** — `reviewedConferences` reads `membership` rows with
 *   `role = 'reviewer'`, under either scope. Reviewer seats usually hang off a
 *   round rather than a conference, so scope is not part of the question.
 *
 * Asked as rights, not as inventory: a fresh owner with no conference yet still sees
 * Conferences, because `/manage` is the only page carrying "New conference" and a
 * count-based rule would lock them out of making their first one.
 */
import type { NavAccess } from '$lib/conference/nav-access';
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { membershipTable } from '$lib/server/db/conference/conference-schema';
import { and, eq, inArray } from 'drizzle-orm';

/** Better Auth's org-wide roles that imply organizer rights. Mirrors `access.ts`. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

/**
 * Both reads are existence checks — `limit(1)` on an index, not a count. The shell
 * layout runs this on every signed-in navigation, so it may not walk a user's
 * memberships.
 */
export async function navAccess(userId: string): Promise<NavAccess> {
	const [orgSeat] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, userId), inArray(member.role, ORG_WIDE_ORGANIZER_ROLES)))
		.limit(1);

	const seats = await db
		.selectDistinct({ role: membershipTable.role })
		.from(membershipTable)
		.where(
			and(
				eq(membershipTable.userId, userId),
				inArray(membershipTable.role, ['organizer', 'reviewer'])
			)
		);

	const orgWide = Boolean(orgSeat);

	return {
		conferences: orgWide || seats.some((s) => s.role === 'organizer'),
		contacts: orgWide,
		reviewing: seats.some((s) => s.role === 'reviewer')
	};
}
