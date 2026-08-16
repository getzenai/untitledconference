/**
 * Whether an organization may be deleted, and why not (#777).
 *
 * Deleting one is not a small act: `organization.id` is referenced with
 * `onDelete: 'cascade'` by `conference`, `speaker_profile`, `crm_pipeline_card`,
 * `crm_segment`, `organization_ai_settings`, `member` and `invitation` — and a
 * conference cascades further into submissions, reviews and the agenda. So the
 * question this answers is deliberately conservative: refuse unless the
 * organization is already empty of the things that would go with it.
 *
 * Pure, so the rule can be read and tested without a database. The counts come
 * from the caller; what to do with them lives here.
 */
export type OrganizationDeletionRequest = {
	/** The stored name, which the person has to reproduce exactly. */
	name: string;
	/** What they typed into the confirmation box. */
	typedName: string;
	/** Only the owner may delete; an admin may not. */
	isOwner: boolean;
	/** Conferences under this organization, whatever their status. */
	conferences: number;
	/** Members other than the person asking. */
	otherMembers: number;
	/** Invitations still outstanding. */
	pendingInvitations: number;
};

/**
 * Also the answer when the organization is not there at all: a non-member must
 * not learn from the wording whether it exists.
 */
export const ONLY_OWNER_CAN_DELETE = 'Only the owner can delete this organization.';

export type OrganizationDeletionVerdict =
	| { ok: true }
	| { ok: false; reason: string; field?: 'confirmName' };

/**
 * The order matters: permission first, then the things that must be cleared,
 * and the typed name last. Someone who is not allowed to delete should hear
 * that before being asked to type anything, and someone who still has a
 * conference should hear *that* rather than "the name does not match" after
 * typing it correctly.
 */
export function checkOrganizationDeletion(
	request: OrganizationDeletionRequest
): OrganizationDeletionVerdict {
	if (!request.isOwner) {
		return { ok: false, reason: ONLY_OWNER_CAN_DELETE };
	}

	const blocker = firstBlocker(request);
	if (blocker) return { ok: false, reason: blocker };

	// Compared exactly, not trimmed-and-lowercased: the point of the box is to
	// make the act deliberate, and a near-miss is not a confirmation.
	if (request.typedName !== request.name) {
		return {
			ok: false,
			reason: 'Type the organization name exactly to confirm.',
			field: 'confirmName'
		};
	}
	return { ok: true };
}

/** The first thing still hanging off the organization, said in full. */
function firstBlocker(request: OrganizationDeletionRequest): string | null {
	if (request.conferences > 0) {
		const them = request.conferences === 1 ? 'it' : 'them';
		return `This organization still has ${counted(request.conferences, 'event')}. Delete ${them} first — deleting the organization would take ${them} along with every submission, review and agenda under ${them}.`;
	}
	if (request.otherMembers > 0) {
		return `This organization still has ${counted(request.otherMembers, 'other member')}. Remove them first.`;
	}
	if (request.pendingInvitations > 0) {
		const them = request.pendingInvitations === 1 ? 'it' : 'them';
		return `This organization still has ${counted(request.pendingInvitations, 'pending invitation')}. Cancel ${them} first.`;
	}
	return null;
}

function counted(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Why the last member cannot simply walk out.
 *
 * Leaving as the only member used to remove the membership row and leave the
 * organization behind with nobody in it — invisible in every list, still
 * owning its rows. Refusing and pointing at delete keeps the choice explicit.
 */
export const LAST_MEMBER_CANNOT_LEAVE =
	'You are the only member. Leaving would leave this organization with nobody in it — delete it instead.';
