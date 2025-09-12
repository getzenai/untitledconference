/**
 * Mock Auth Context for Better Auth
 *
 * This module provides comprehensive mocking utilities for Better Auth API methods
 * to enable reliable server action testing. The mocks return realistic data structures
 * matching Better Auth's actual responses and support configurable scenarios.
 *
 * ## Usage Examples:
 *
 * ### Basic Mocking
 * ```typescript
 * import { vi } from 'vitest';
 * import { mockBetterAuth, createOwnerAuthMock } from '$lib/test/auth-mock';
 *
 * vi.mock('$lib/auth', () => ({
 *   auth: mockBetterAuth(createOwnerAuthMock())
 * }));
 * ```
 *
 * ### Testing Server Actions
 * ```typescript
 * import { actions } from './+page.server';
 * import { createOwnerAuthMock } from '$lib/test/auth-mock';
 *
 * const mockAPI = createOwnerAuthMock();
 * const formData = new FormData();
 * formData.set('email', 'test@example.com');
 *
 * const result = await actions.inviteMember({
 *   request: { formData: () => Promise.resolve(formData), headers: mockHeaders },
 *   locals: { user: mockUser }
 * });
 * ```
 *
 * ### Error Testing
 * ```typescript
 * const errorMock = createErrorAuthMock(['createInvitation'], 'Invitation failed');
 * // Will throw "Invitation failed" when createInvitation is called
 * ```
 *
 * ### Custom Configuration
 * ```typescript
 * const customMock = new MockAuthAPI({
 *   activeMember: createMockActiveMember({ role: 'admin' }),
 *   organizations: [createMockOrganization({ name: 'Test Org' })],
 *   members: [createMockMember({ role: 'member' })]
 * });
 * ```
 */

import { vi } from 'vitest';
import type { OrganizationRole } from '../server/utils/organization-transfer';

// =============================================================================
// Type Definitions - Mirror Better Auth's response structures
// =============================================================================

export interface MockUser {
	id: string;
	email: string;
	name: string | null;
	role: string;
	emailVerified: boolean;
	image: string | null;
	banned: boolean;
	banReason: string | null;
	banExpiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface MockOrganization {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	metadata: string | null;
	createdAt: Date;
}

export interface MockMember {
	id: string;
	organizationId: string;
	userId: string;
	role: OrganizationRole;
	createdAt: Date;
	user?: MockUser; // Sometimes populated in API responses
}

export interface MockInvitation {
	id: string;
	organizationId: string;
	organizationName?: string;
	email: string;
	role: OrganizationRole;
	status: 'pending' | 'accepted' | 'rejected' | 'expired';
	inviterId?: string;
	inviterEmail?: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface MockActiveMember {
	id: string;
	userId: string;
	organizationId: string;
	role: OrganizationRole;
	user?: MockUser;
}

export interface MockAuthHeaders {
	get: (name: string) => string | null;
	has: (name: string) => boolean;
	[Symbol.iterator](): IterableIterator<[string, string]>;
}

// =============================================================================
// Mock Data Factories - Generate consistent test data
// =============================================================================

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
	const baseId = Math.random().toString(36).substring(2, 15);
	return {
		id: `user_${baseId}`,
		email: `user-${baseId}@example.com`,
		name: `Test User ${baseId}`,
		role: 'user',
		emailVerified: true,
		image: null,
		banned: false,
		banReason: null,
		banExpiresAt: null,
		createdAt: new Date('2024-01-01'),
		updatedAt: new Date('2024-01-01'),
		...overrides
	};
}

export function createMockOrganization(
	overrides: Partial<MockOrganization> = {}
): MockOrganization {
	const baseId = Math.random().toString(36).substring(2, 15);
	const name = `Test Organization ${baseId}`;
	return {
		id: `org_${baseId}`,
		name,
		slug: name.toLowerCase().replace(/\s+/g, '-'),
		logo: null,
		metadata: null,
		createdAt: new Date('2024-01-01'),
		...overrides
	};
}

export function createMockMember(overrides: Partial<MockMember> = {}): MockMember {
	const baseId = Math.random().toString(36).substring(2, 15);
	return {
		id: `member_${baseId}`,
		organizationId: `org_${baseId}`,
		userId: `user_${baseId}`,
		role: 'member',
		createdAt: new Date('2024-01-01'),
		...overrides
	};
}

export function createMockInvitation(overrides: Partial<MockInvitation> = {}): MockInvitation {
	const baseId = Math.random().toString(36).substring(2, 15);
	return {
		id: `inv_${baseId}`,
		organizationId: `org_${baseId}`,
		organizationName: 'Test Organization',
		email: `invitee-${baseId}@example.com`,
		role: 'member',
		status: 'pending',
		inviterId: `user_${baseId}`,
		inviterEmail: `inviter-${baseId}@example.com`,
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
		createdAt: new Date('2024-01-01'),
		updatedAt: new Date('2024-01-01'),
		...overrides
	};
}

export function createMockActiveMember(
	overrides: Partial<MockActiveMember> = {}
): MockActiveMember {
	const baseId = Math.random().toString(36).substring(2, 15);
	return {
		id: `member_${baseId}`,
		userId: `user_${baseId}`,
		organizationId: `org_${baseId}`,
		role: 'owner',
		...overrides
	};
}

export function createMockHeaders(headers: Record<string, string> = {}): MockAuthHeaders {
	// Convert all header keys to lowercase for case-insensitive access
	const headersMap = new Map(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
	);

	return {
		get: (name: string) => headersMap.get(name.toLowerCase()) || null,
		has: (name: string) => headersMap.has(name.toLowerCase()),
		[Symbol.iterator]: function* () {
			for (const [key, value] of headersMap) {
				yield [key, value] as [string, string];
			}
		}
	} as MockAuthHeaders;
}

// =============================================================================
// Mock Configuration Interface - Control mock behavior
// =============================================================================

export interface MockAuthConfig {
	// User/Session state
	currentUserId?: string;
	isAuthenticated?: boolean;

	// Active member/organization state
	activeMember?: MockActiveMember | null;
	organizations?: MockOrganization[];

	// Organization-specific data
	members?: MockMember[];
	invitations?: MockInvitation[];
	userInvitations?: MockInvitation[];

	// Error simulation
	shouldThrow?: boolean;
	errorMessage?: string;
	errorOn?: string[]; // List of method names that should throw
}

// =============================================================================
// Mock Auth API Implementation
// =============================================================================

export class MockAuthAPI {
	private config: MockAuthConfig;

	constructor(config: MockAuthConfig = {}) {
		this.config = {
			isAuthenticated: true,
			organizations: [],
			members: [],
			invitations: [],
			userInvitations: [],
			shouldThrow: false,
			errorMessage: 'Mock API Error',
			errorOn: [],
			...config
		};
	}

	/**
	 * Update mock configuration for different test scenarios
	 */
	updateConfig(newConfig: Partial<MockAuthConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	/**
	 * Check if a specific method should throw an error
	 */
	private shouldThrowFor(methodName: string): boolean {
		return this.config.shouldThrow || (this.config.errorOn?.includes(methodName) ?? false);
	}

	/**
	 * Mock: auth.api.getActiveMember()
	 * Returns the current user's active organization membership
	 */
	getActiveMember = vi
		.fn()
		.mockImplementation(async ({ headers: _headers }: { headers: Headers }) => {
			if (this.shouldThrowFor('getActiveMember')) {
				throw new Error(this.config.errorMessage || 'Failed to get active member');
			}

			if (!this.config.isAuthenticated) {
				return null;
			}

			return this.config.activeMember || null;
		});

	/**
	 * Mock: auth.api.listOrganizations()
	 * Returns list of organizations the user is a member of
	 */
	listOrganizations = vi
		.fn()
		.mockImplementation(async ({ headers: _headers }: { headers: Headers }) => {
			if (this.shouldThrowFor('listOrganizations')) {
				throw new Error(this.config.errorMessage || 'Failed to list organizations');
			}

			if (!this.config.isAuthenticated) {
				return [];
			}

			return this.config.organizations || [];
		});

	/**
	 * Mock: auth.api.listMembers()
	 * Returns organization members
	 */
	listMembers = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				query
			}: {
				headers: Headers;
				query: { organizationId: string };
			}) => {
				if (this.shouldThrowFor('listMembers')) {
					throw new Error(this.config.errorMessage || 'Failed to list members');
				}

				const members =
					this.config.members?.filter((m) => m.organizationId === query.organizationId) || [];

				return {
					members
				};
			}
		);

	/**
	 * Mock: auth.api.createInvitation()
	 * Creates a new organization invitation
	 */
	createInvitation = vi.fn().mockImplementation(
		async ({
			headers: _headers,
			body
		}: {
			headers: Headers;
			body: {
				organizationId: string;
				email: string;
				role: OrganizationRole;
			};
		}) => {
			if (this.shouldThrowFor('createInvitation')) {
				throw new Error(this.config.errorMessage || 'Failed to create invitation');
			}

			const invitation = createMockInvitation({
				organizationId: body.organizationId,
				email: body.email,
				role: body.role
			});

			return invitation;
		}
	);

	/**
	 * Mock: auth.api.updateMemberRole()
	 * Updates a member's role in the organization
	 */
	updateMemberRole = vi.fn().mockImplementation(
		async ({
			headers: _headers,
			body: _body
		}: {
			headers: Headers;
			body: {
				organizationId: string;
				memberId: string;
				role: OrganizationRole | OrganizationRole[];
			};
		}) => {
			if (this.shouldThrowFor('updateMemberRole')) {
				throw new Error(this.config.errorMessage || 'Failed to update member role');
			}

			// In a real scenario, this would update the member's role
			// For mocking purposes, we just return success
			return { success: true };
		}
	);

	/**
	 * Mock: auth.api.removeMember()
	 * Removes a member from the organization
	 */
	removeMember = vi.fn().mockImplementation(
		async ({
			headers: _headers,
			body: _body
		}: {
			headers: Headers;
			body: {
				organizationId: string;
				memberIdOrEmail: string;
			};
		}) => {
			if (this.shouldThrowFor('removeMember')) {
				throw new Error(this.config.errorMessage || 'Failed to remove member');
			}

			return { success: true };
		}
	);

	/**
	 * Mock: auth.api.leaveOrganization()
	 * Current user leaves the organization
	 */
	leaveOrganization = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body: _body
			}: {
				headers: Headers;
				body: { organizationId: string };
			}) => {
				if (this.shouldThrowFor('leaveOrganization')) {
					throw new Error(this.config.errorMessage || 'Failed to leave organization');
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.setActiveOrganization()
	 * Sets the user's active organization
	 */
	setActiveOrganization = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body
			}: {
				headers: Headers;
				body: { organizationId: string };
			}) => {
				if (this.shouldThrowFor('setActiveOrganization')) {
					throw new Error(this.config.errorMessage || 'Failed to set active organization');
				}

				// Update the active member in our mock
				if (this.config.activeMember) {
					this.config.activeMember.organizationId = body.organizationId;
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.acceptInvitation()
	 * Accepts an organization invitation
	 */
	acceptInvitation = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body: _body
			}: {
				headers: Headers;
				body: { invitationId: string };
			}) => {
				if (this.shouldThrowFor('acceptInvitation')) {
					throw new Error(this.config.errorMessage || 'Failed to accept invitation');
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.rejectInvitation()
	 * Rejects an organization invitation
	 */
	rejectInvitation = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body: _body
			}: {
				headers: Headers;
				body: { invitationId: string };
			}) => {
				if (this.shouldThrowFor('rejectInvitation')) {
					throw new Error(this.config.errorMessage || 'Failed to reject invitation');
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.cancelInvitation()
	 * Cancels a pending invitation
	 */
	cancelInvitation = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body: _body
			}: {
				headers: Headers;
				body: { invitationId: string };
			}) => {
				if (this.shouldThrowFor('cancelInvitation')) {
					throw new Error(this.config.errorMessage || 'Failed to cancel invitation');
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.deleteOrganization()
	 * Deletes an organization (owner only)
	 */
	deleteOrganization = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				body: _body
			}: {
				headers: Headers;
				body: { organizationId: string };
			}) => {
				if (this.shouldThrowFor('deleteOrganization')) {
					throw new Error(this.config.errorMessage || 'Failed to delete organization');
				}

				return { success: true };
			}
		);

	/**
	 * Mock: auth.api.listInvitations()
	 * Lists pending invitations for an organization
	 */
	listInvitations = vi
		.fn()
		.mockImplementation(
			async ({
				headers: _headers,
				query
			}: {
				headers: Headers;
				query: { organizationId: string };
			}) => {
				if (this.shouldThrowFor('listInvitations')) {
					throw new Error(this.config.errorMessage || 'Failed to list invitations');
				}

				return (
					this.config.invitations?.filter(
						(inv) => inv.organizationId === query.organizationId && inv.status === 'pending'
					) || []
				);
			}
		);

	/**
	 * Mock: auth.api.listUserInvitations()
	 * Lists invitations sent to a specific user
	 */
	listUserInvitations = vi
		.fn()
		.mockImplementation(
			async ({ headers: _headers, query }: { headers: Headers; query: { email: string } }) => {
				if (this.shouldThrowFor('listUserInvitations')) {
					throw new Error(this.config.errorMessage || 'Failed to list user invitations');
				}

				return (
					this.config.userInvitations?.filter(
						(inv) => inv.email === query.email && inv.status === 'pending'
					) || []
				);
			}
		);

	/**
	 * Mock: auth.api.getInvitation()
	 * Gets detailed information about a specific invitation
	 */
	getInvitation = vi
		.fn()
		.mockImplementation(
			async ({ headers: _headers, query }: { headers: Headers; query: { id: string } }) => {
				if (this.shouldThrowFor('getInvitation')) {
					throw new Error(this.config.errorMessage || 'Failed to get invitation');
				}

				const invitation = [
					...(this.config.invitations || []),
					...(this.config.userInvitations || [])
				].find((inv) => inv.id === query.id);

				return invitation || null;
			}
		);
}

// =============================================================================
// Convenience Functions for Common Test Scenarios
// =============================================================================

/**
 * Creates a mock auth API configured for a typical organization owner scenario
 */
export function createOwnerAuthMock(customConfig: Partial<MockAuthConfig> = {}): MockAuthAPI {
	const user = createMockUser({ role: 'user' });
	const organization = createMockOrganization();
	const activeMember = createMockActiveMember({
		userId: user.id,
		organizationId: organization.id,
		role: 'owner',
		user
	});

	const member1 = createMockMember({
		organizationId: organization.id,
		userId: user.id,
		role: 'owner',
		user
	});

	const member2 = createMockMember({
		organizationId: organization.id,
		role: 'member'
	});

	return new MockAuthAPI({
		isAuthenticated: true,
		currentUserId: user.id,
		activeMember,
		organizations: [organization],
		members: [member1, member2],
		invitations: [],
		userInvitations: [],
		...customConfig
	});
}

/**
 * Creates a mock auth API configured for a regular member scenario
 */
export function createMemberAuthMock(customConfig: Partial<MockAuthConfig> = {}): MockAuthAPI {
	const user = createMockUser({ role: 'user' });
	const organization = createMockOrganization();
	const activeMember = createMockActiveMember({
		userId: user.id,
		organizationId: organization.id,
		role: 'member',
		user
	});

	return new MockAuthAPI({
		isAuthenticated: true,
		currentUserId: user.id,
		activeMember,
		organizations: [organization],
		members: [
			createMockMember({
				organizationId: organization.id,
				userId: user.id,
				role: 'member',
				user
			})
		],
		...customConfig
	});
}

/**
 * Creates a mock auth API configured for an unauthenticated user scenario
 */
export function createUnauthenticatedAuthMock(): MockAuthAPI {
	return new MockAuthAPI({
		isAuthenticated: false,
		activeMember: null,
		organizations: [],
		members: [],
		invitations: [],
		userInvitations: []
	});
}

/**
 * Creates a mock auth API that throws errors for testing error scenarios
 */
export function createErrorAuthMock(errorOn: string[] = [], errorMessage?: string): MockAuthAPI {
	// Create basic data for non-error methods to work
	const user = createMockUser();
	const organization = createMockOrganization();
	const activeMember = createMockActiveMember({
		userId: user.id,
		organizationId: organization.id,
		role: 'owner'
	});

	return new MockAuthAPI({
		isAuthenticated: true,
		currentUserId: user.id,
		activeMember,
		organizations: [organization],
		members: [],
		invitations: [],
		userInvitations: [],
		shouldThrow: errorOn.length === 0, // If no specific methods, throw on all
		errorOn,
		errorMessage: errorMessage || 'Mock API Error'
	});
}

// =============================================================================
// Vitest Integration Helper
// =============================================================================

/**
 * Helper to mock the Better Auth instance for vitest tests
 *
 * Usage in tests:
 * ```typescript
 * import { mockBetterAuth } from '$lib/test/auth-mock';
 *
 * vi.mock('$lib/auth', () => ({
 *   auth: mockBetterAuth(createOwnerAuthMock())
 * }));
 * ```
 */
export function mockBetterAuth(mockAPI: MockAuthAPI) {
	return {
		api: {
			getActiveMember: mockAPI.getActiveMember,
			listOrganizations: mockAPI.listOrganizations,
			listMembers: mockAPI.listMembers,
			createInvitation: mockAPI.createInvitation,
			updateMemberRole: mockAPI.updateMemberRole,
			removeMember: mockAPI.removeMember,
			leaveOrganization: mockAPI.leaveOrganization,
			setActiveOrganization: mockAPI.setActiveOrganization,
			acceptInvitation: mockAPI.acceptInvitation,
			rejectInvitation: mockAPI.rejectInvitation,
			cancelInvitation: mockAPI.cancelInvitation,
			deleteOrganization: mockAPI.deleteOrganization,
			listInvitations: mockAPI.listInvitations,
			listUserInvitations: mockAPI.listUserInvitations,
			getInvitation: mockAPI.getInvitation
		}
	};
}

/**
 * Reset all mock function calls - useful in beforeEach hooks
 */
export function resetAuthMocks(mockAPI: MockAuthAPI): void {
	mockAPI.getActiveMember.mockClear();
	mockAPI.listOrganizations.mockClear();
	mockAPI.listMembers.mockClear();
	mockAPI.createInvitation.mockClear();
	mockAPI.updateMemberRole.mockClear();
	mockAPI.removeMember.mockClear();
	mockAPI.leaveOrganization.mockClear();
	mockAPI.setActiveOrganization.mockClear();
	mockAPI.acceptInvitation.mockClear();
	mockAPI.rejectInvitation.mockClear();
	mockAPI.cancelInvitation.mockClear();
	mockAPI.deleteOrganization.mockClear();
	mockAPI.listInvitations.mockClear();
	mockAPI.listUserInvitations.mockClear();
	mockAPI.getInvitation.mockClear();
}
