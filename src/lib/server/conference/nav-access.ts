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
import {
	conferenceTable,
	membershipTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { evaluationPlanTable, reviewRoundTable } from '$lib/server/db/conference/review-schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

/** Better Auth's org-wide roles that imply organizer rights. Mirrors `access.ts`. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

/**
 * No read here counts anything — they are existence checks, or a `selectDistinct`
 * over a role column whose range is three values. The shell layout runs this on
 * every signed-in navigation, so it may not walk a user's memberships.
 */
export async function navAccess(userId: string, email: string | null): Promise<NavAccess> {
	// One `Promise.all`, not a chain of awaits: the driver pipelines concurrent
	// queries onto the single per-request connection, so this costs one
	// database roundtrip — measured on this exact setup while chasing the
	// public pages' latency. The two slug lookups ride that same trip; they
	// name `/review/<slug>` on the sidebar so the common reviewer does not
	// pay `/review`'s 303 (#373).
	const [orgSeats, seats, profile, viaConference, viaRound] = await Promise.all([
		// Every seat's role, not just the organizer ones: whether there is *any*
		// seat is what decides between a locked entry and no entry (#439), and
		// asking for it here keeps this at one roundtrip.
		db.selectDistinct({ role: member.role }).from(member).where(eq(member.userId, userId)),
		db
			.selectDistinct({ role: membershipTable.role })
			.from(membershipTable)
			.where(
				and(
					eq(membershipTable.userId, userId),
					inArray(membershipTable.role, ['organizer', 'reviewer'])
				)
			),
		hasSpeakerProfile(userId, email),
		db
			.selectDistinct({ slug: conferenceTable.slug })
			.from(membershipTable)
			.innerJoin(conferenceTable, eq(conferenceTable.id, membershipTable.scopeId))
			.where(
				and(
					eq(membershipTable.userId, userId),
					eq(membershipTable.role, 'reviewer'),
					eq(membershipTable.scopeType, 'conference')
				)
			),
		db
			.selectDistinct({ slug: conferenceTable.slug })
			.from(membershipTable)
			.innerJoin(reviewRoundTable, eq(reviewRoundTable.id, membershipTable.scopeId))
			.innerJoin(evaluationPlanTable, eq(evaluationPlanTable.id, reviewRoundTable.evaluationPlanId))
			.innerJoin(conferenceTable, eq(conferenceTable.id, evaluationPlanTable.conferenceId))
			.where(
				and(
					eq(membershipTable.userId, userId),
					eq(membershipTable.role, 'reviewer'),
					eq(membershipTable.scopeType, 'round')
				)
			)
	]);

	const orgWide = orgSeats.some((s) => ORG_WIDE_ORGANIZER_ROLES.includes(s.role));
	const slugs = [...new Set([...viaConference, ...viaRound].map((row) => row.slug))];

	return {
		conferences: orgWide || seats.some((s) => s.role === 'organizer'),
		contacts: orgWide,
		reviewing: seats.some((s) => s.role === 'reviewer'),
		reviewSlug: slugs.length === 1 ? slugs[0] : null,
		speakerProfile: profile,
		organization: orgSeats.length > 0
	};
}

/**
 * Does this person have a speaker profile — the one flag the conference rail needs
 * from this file (#127).
 *
 * The email half mirrors `claimProfilesForAccount`: a profile an organizer created
 * for this address is already this person's, the claim just has not run yet because
 * they never opened the portal — exactly who the menu entry is for. An existence
 * check, not the claim itself: writing on every navigation is not this function's
 * business.
 */
export async function hasSpeakerProfile(userId: string, email: string | null): Promise<boolean> {
	const [profile] = await db
		.select({ id: speakerProfileTable.id })
		.from(speakerProfileTable)
		.where(
			email
				? or(
						eq(speakerProfileTable.userId, userId),
						and(isNull(speakerProfileTable.userId), eq(speakerProfileTable.email, email))
					)
				: eq(speakerProfileTable.userId, userId)
		)
		.limit(1);

	return Boolean(profile);
}
