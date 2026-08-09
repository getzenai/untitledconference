/**
 * Who may open the organizer's side of a conference.
 *
 * This is the only real permission boundary in the product (`scoping` in the rubric,
 * Ü3 in ROLES_AND_JOURNEYS). It lives in one function so that every organizer route
 * asks the same question — a guard that is copied per route is a guard that is
 * eventually forgotten on one of them.
 *
 * A user who may not see the conference gets a 404, not a 403. A 403 confirms that
 * the slug exists, and the reviewer who was never meant to know that now knows it.
 */
import { db } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import {
	conferenceTable,
	membershipTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';

/** Better Auth's org-wide roles that imply organizer rights on every conference below them. */
const ORG_WIDE_ORGANIZER_ROLES = ['owner', 'admin'];

export type OrganizerContext = {
	conference: Conference;
	/** `org` when the right comes from owning the organization, `conference` when granted per event. */
	via: 'org' | 'conference';
};

/**
 * Resolves the conference behind `slug` and asserts that `userId` organizes it.
 *
 * Throws a SvelteKit 404 in both failure cases — unknown slug and known slug the
 * user has no business with are deliberately indistinguishable.
 */
export async function requireOrganizer(userId: string, slug: string): Promise<OrganizerContext> {
	const [conference] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, slug))
		.limit(1);

	if (!conference) throw error(404, 'Conference not found');

	const [orgSeat] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, conference.organizationId)))
		.limit(1);

	if (orgSeat && ORG_WIDE_ORGANIZER_ROLES.includes(orgSeat.role)) {
		return { conference, via: 'org' };
	}

	const [scoped] = await db
		.select({ id: membershipTable.id })
		.from(membershipTable)
		.where(
			and(
				eq(membershipTable.userId, userId),
				eq(membershipTable.role, 'organizer'),
				eq(membershipTable.scopeType, 'conference'),
				eq(membershipTable.scopeId, conference.id)
			)
		)
		.limit(1);

	if (scoped) return { conference, via: 'conference' };

	throw error(404, 'Conference not found');
}

/**
 * Every conference this user organizes, for the conference picker.
 *
 * Two sources, one list: the organizations they own or administer, and the single
 * conferences they were added to. A user can legitimately have both.
 */
export async function organizedConferences(userId: string): Promise<Conference[]> {
	const seats = await db
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, userId));

	const organizationIds = seats
		.filter((s) => ORG_WIDE_ORGANIZER_ROLES.includes(s.role))
		.map((s) => s.organizationId);

	const scopedIds = (
		await db
			.select({ scopeId: membershipTable.scopeId })
			.from(membershipTable)
			.where(
				and(
					eq(membershipTable.userId, userId),
					eq(membershipTable.role, 'organizer'),
					eq(membershipTable.scopeType, 'conference')
				)
			)
	).map((m) => m.scopeId);

	if (organizationIds.length === 0 && scopedIds.length === 0) return [];

	const byOrg =
		organizationIds.length > 0
			? await db
					.select()
					.from(conferenceTable)
					.where(inArray(conferenceTable.organizationId, organizationIds))
			: [];

	const byConference =
		scopedIds.length > 0
			? await db.select().from(conferenceTable).where(inArray(conferenceTable.id, scopedIds))
			: [];

	const seen = new Map<number, Conference>();
	for (const c of [...byOrg, ...byConference]) seen.set(c.id, c);

	return [...seen.values()].sort((a, b) => (a.startsOn ?? '').localeCompare(b.startsOn ?? ''));
}
