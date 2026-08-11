import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { membershipTable } from '$lib/server/db/conference/conference-schema';
import { and, eq, inArray, or } from 'drizzle-orm';

/**
 * The reviewer seats assignment and committee views agree belong to a conference.
 *
 * Conference seats apply to every round. Round seats apply only when that round
 * belongs to the conference. Keeping this predicate shared prevents one screen
 * from accepting a reviewer that the other screen cannot see.
 */
export function conferenceReviewerMemberships(conferenceId: number, roundIds: number[]) {
	const roundScope =
		roundIds.length > 0
			? and(eq(membershipTable.scopeType, 'round'), inArray(membershipTable.scopeId, roundIds))
			: undefined;

	return db
		.select({
			membershipId: membershipTable.id,
			userId: membershipTable.userId,
			scopeType: membershipTable.scopeType,
			scopeId: membershipTable.scopeId,
			name: user.name,
			email: user.email
		})
		.from(membershipTable)
		.innerJoin(user, eq(user.id, membershipTable.userId))
		.where(
			and(
				eq(membershipTable.role, 'reviewer'),
				or(
					and(
						eq(membershipTable.scopeType, 'conference'),
						eq(membershipTable.scopeId, conferenceId)
					),
					roundScope
				)
			)
		);
}
