export type OrganizationRole = 'owner' | 'admin' | 'member';

interface AuthAPI {
	api: {
		listMembers: (params: { headers: Headers; query: { organizationId: string } }) => Promise<{
			members?: Array<{
				id: string;
				userId: string;
				role: string;
			}>;
		}>;
		updateMemberRole: (params: {
			headers: Headers;
			body: {
				organizationId?: string;
				memberId: string;
				role: OrganizationRole | OrganizationRole[];
			};
		}) => Promise<unknown>;
		leaveOrganization: (params: {
			headers: Headers;
			body: { organizationId: string };
		}) => Promise<unknown>;
	};
}

/**
 * Helper to ensure sequential execution of ownership transfer
 * This prevents race conditions during role updates
 */
export async function transferOwnershipSafely(
	auth: AuthAPI,
	headers: Headers,
	organizationId: string,
	currentOwnerId: string,
	newOwnerId: string
): Promise<{ success: boolean; error?: string }> {
	try {
		// Step 1: Verify current user is still the owner
		const members = await auth.api.listMembers({
			headers,
			query: { organizationId }
		});

		const currentOwner = members?.members?.find(
			(m) => m.userId === currentOwnerId && m.role === 'owner'
		);

		if (!currentOwner) {
			return { success: false, error: 'You are no longer the owner of this organization' };
		}

		// Step 2: Verify new owner is still a member
		const newOwner = members?.members?.find((m) => m.id === newOwnerId);

		if (!newOwner) {
			return { success: false, error: 'Selected member no longer exists in the organization' };
		}

		// Step 3: Update new owner's role
		await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId,
				memberId: newOwnerId,
				role: 'owner'
			}
		});

		// Step 4: Leave the organization
		await auth.api.leaveOrganization({
			headers,
			body: { organizationId }
		});

		return { success: true };
	} catch (_error) {
		// This is a utility function, logging should be done by the caller
		return { success: false, error: 'Failed to transfer ownership' };
	}
}
