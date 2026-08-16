import { db } from '$lib/server/db';
import { invitation as invitationTable, organization } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';

export type PublicInvitation =
	| {
			isValid: true;
			email: string;
			organizationName: string;
			role: string;
			expiresAt: Date;
	  }
	| { isValid: false; error: string };

/**
 * The invitation landing page and registration form are public by design. Keep
 * their validation in one place so both show the same recipient and validity.
 */
export async function getPublicInvitation(code: string): Promise<PublicInvitation> {
	const [invitation] = await db
		.select({
			status: invitationTable.status,
			expiresAt: invitationTable.expiresAt,
			email: invitationTable.email,
			role: invitationTable.role,
			organizationName: organization.name
		})
		.from(invitationTable)
		.leftJoin(organization, eq(invitationTable.organizationId, organization.id))
		.where(eq(invitationTable.id, code))
		.limit(1);

	if (!invitation) return { isValid: false, error: 'Invalid or expired invitation' };
	if (new Date(invitation.expiresAt) < new Date()) {
		return { isValid: false, error: 'This invitation has expired' };
	}
	if (invitation.status === 'accepted') {
		return { isValid: false, error: 'This invitation has already been accepted' };
	}

	return {
		isValid: true,
		email: invitation.email,
		organizationName: invitation.organizationName || 'the organization',
		role: invitation.role || 'member',
		expiresAt: invitation.expiresAt
	};
}
