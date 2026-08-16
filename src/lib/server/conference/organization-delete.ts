/**
 * Carrying out the deletion of an organization, without a window between
 * deciding and doing (#777, #792).
 *
 * The rule itself is pure and lives in `$lib/conference/organization-delete`.
 * What is server-side about this file is *when* the numbers are read: gathering
 * the counts, judging them and deleting have to be one atomic act, or the
 * refusal is only as true as the moment it was computed. Counting zero
 * conferences and then deleting is check-then-act — a talk created in between
 * is taken along by the cascade, and seven tables hang off `organization.id`.
 *
 * Two things close that window, and both are needed:
 *
 * 1. `SELECT ... FOR UPDATE` on the organization row *first*. Inserting a
 *    conference takes a `FOR KEY SHARE` lock on the row it references, so the
 *    lock makes a concurrent insert wait for us — or us wait for it.
 * 2. Deriving every count *after* that lock, inside the same transaction. A
 *    number read before the lock says nothing about the state we are deleting.
 *
 * The delete itself is a single `DELETE FROM organization`; the seven
 * `onDelete: 'cascade'` edges do the rest, in the same transaction. Better
 * Auth's `auth.api.deleteOrganization` cannot be used here for the same reason
 * the race existed: it opens its own connection and cannot join ours.
 */
import {
	checkOrganizationDeletion,
	ONLY_OWNER_CAN_DELETE,
	type OrganizationDeletionVerdict
} from '$lib/conference/organization-delete';
import { db } from '$lib/server/db';
import { invitation, member, organization } from '$lib/server/db/auth-schema';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { and, count, eq } from 'drizzle-orm';

export type OrganizationDeletionInput = {
	organizationId: string;
	/** The person asking; only an owner may delete. */
	userId: string;
	/** What they typed into the confirmation box. */
	typedName: string;
};

/**
 * Delete the organization if it is still empty, judged at the moment of the
 * delete. Returns the same verdict shape as the pure rule, so the caller
 * reports the reason rather than inventing one.
 *
 * `database` is a parameter so an integration test can hold a second
 * connection open against the same rows; production always passes nothing.
 */
export async function deleteEmptyOrganization(
	input: OrganizationDeletionInput,
	database: typeof db = db
): Promise<OrganizationDeletionVerdict> {
	return database.transaction(async (tx) => {
		// Everything below reads state this lock is holding still. A caller who
		// is not a member gets the same answer as one who is not the owner: the
		// existence of someone else's organization is not ours to confirm.
		const [locked] = await tx
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, input.organizationId))
			.for('update');
		if (!locked) return { ok: false, reason: ONLY_OWNER_CAN_DELETE };

		const members = await tx
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, input.organizationId));

		const [conferences] = await tx
			.select({ value: count() })
			.from(conferenceTable)
			.where(eq(conferenceTable.organizationId, input.organizationId));

		const [pending] = await tx
			.select({ value: count() })
			.from(invitation)
			.where(
				and(eq(invitation.organizationId, input.organizationId), eq(invitation.status, 'pending'))
			);

		const verdict = checkOrganizationDeletion({
			name: locked.name,
			typedName: input.typedName,
			isOwner: members.find((row) => row.userId === input.userId)?.role === 'owner',
			conferences: conferences?.value ?? 0,
			otherMembers: members.filter((row) => row.userId !== input.userId).length,
			pendingInvitations: pending?.value ?? 0
		});
		if (!verdict.ok) return verdict;

		await tx.delete(organization).where(eq(organization.id, input.organizationId));
		return verdict;
	});
}
