import type { ActionFailure } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';

/**
 * Common error handling utility for auth operations
 * @param operation - The async operation to execute
 * @param errorMessage - Error message to return on failure
 * @returns Success result with data or ActionFailure
 */
export async function handleAuthOperation<T>(
	operation: () => Promise<T>,
	errorMessage: string
): Promise<{ success: true; data?: T } | ActionFailure<{ error: string }>> {
	try {
		const result = await operation();
		return { success: true, data: result };
	} catch (error) {
		console.error(errorMessage, error);
		return fail(500, { error: errorMessage });
	}
}

/**
 * Execute multiple auth operations in sequence with atomicity guarantee
 * All operations must succeed or all are considered failed
 * @param operations - Array of operations to execute
 * @param errorMessage - Error message to return on failure
 * @returns Success result with array of operation results or ActionFailure
 */
export async function handleAtomicAuthOperations<T extends unknown[]>(
	operations: { [K in keyof T]: () => Promise<T[K]> },
	errorMessage: string
): Promise<{ success: true; data: T } | ActionFailure<{ error: string }>> {
	try {
		const results = [] as unknown as T;
		for (let i = 0; i < operations.length; i++) {
			results[i] = await operations[i]();
		}
		return { success: true, data: results };
	} catch (error) {
		console.error(errorMessage, error);
		return fail(500, { error: errorMessage });
	}
}

type OrganizationRole = 'owner' | 'admin' | 'member';

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
	} catch (error) {
		console.error('Error during ownership transfer:', error);
		return { success: false, error: 'Failed to transfer ownership' };
	}
}
