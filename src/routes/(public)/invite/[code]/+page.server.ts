import { db } from '$lib/server/db';
import { invitation as invitationTable, organization } from '$lib/server/db/auth-schema';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { code } = params;

	if (!code) {
		throw error(404, 'Invalid invitation link');
	}

	try {
		// Check if invitation exists and is valid
		const result = await db
			.select({
				id: invitationTable.id,
				status: invitationTable.status,
				expiresAt: invitationTable.expiresAt,
				organizationName: organization.name,
				organizationId: invitationTable.organizationId
			})
			.from(invitationTable)
			.leftJoin(organization, eq(invitationTable.organizationId, organization.id))
			.where(eq(invitationTable.id, code))
			.limit(1);

		if (result.length === 0) {
			// Invitation not found
			return {
				invitationCode: code,
				isValid: false,
				error: 'Invalid or expired invitation'
			};
		}

		const invitation = result[0];

		// Check if invitation is expired
		if (new Date(invitation.expiresAt) < new Date()) {
			return {
				invitationCode: code,
				isValid: false,
				error: 'This invitation has expired'
			};
		}

		// Check if already accepted
		if (invitation.status === 'accepted') {
			return {
				invitationCode: code,
				isValid: false,
				error: 'This invitation has already been accepted'
			};
		}

		// Valid invitation
		return {
			invitationCode: code,
			isValid: true,
			organizationName: invitation.organizationName || 'the organization'
		};
	} catch (err) {
		console.error('Error checking invitation:', err);
		return {
			invitationCode: code,
			isValid: false,
			error: 'Failed to validate invitation'
		};
	}
};
