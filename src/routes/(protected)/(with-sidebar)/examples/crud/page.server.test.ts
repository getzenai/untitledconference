/**
 * CRUD Operations Server Actions Tests
 *
 * Comprehensive tests covering:
 * - Load function with organization filtering
 * - Create action with validation
 * - Update action with ownership verification
 * - Delete action with permissions
 * - Error handling and edge cases
 */

import { exampleObjectsTable } from '$lib/server/db/examples/crud-example-schema';
import {
	cleanupTestDatabase,
	closeTestDatabase,
	createTestExampleObject,
	createTestMembership,
	createTestOrganization,
	createTestUser,
	type TestExampleObject,
	type TestOrganization,
	type TestUser
} from '$lib/server/db/test-utils';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Use a unique connection ID for this test file
const CONNECTION_ID = 'crud-server-test';

// Mock the database module to use test database
vi.mock('$lib/server/db', async () => {
	const testUtils = await import('$lib/server/db/test-utils');
	return {
		db: testUtils.createTestDatabase(CONNECTION_ID)
	};
});

// Get reference to the test database for direct queries
const { createTestDatabase } = await import('$lib/server/db/test-utils');
const db = createTestDatabase(CONNECTION_ID);

// Import the server actions after mocking the database
const { load, actions } = await import('./+page.server');
const { actions: actionsById, load: loadById } = await import('./[id]/+page.server');

describe('CRUD Server Actions', () => {
	let testUser: TestUser;
	let otherUser: TestUser;
	let organization: TestOrganization;
	let testObject: TestExampleObject;

	beforeEach(async () => {
		await setupTestData();
	});

	afterEach(async () => {
		// Only cleanup data, but keep connection alive for next test
		await cleanupTestDatabase(CONNECTION_ID);
	});

	// Close database connection after ALL tests complete
	afterAll(async () => {
		if (process.env.NODE_ENV === 'test') {
			await closeTestDatabase(CONNECTION_ID);
		}
	});

	async function setupTestData(): Promise<void> {
		// Clean up and set up fresh test data
		await cleanupTestDatabase(CONNECTION_ID);

		// Create test users
		testUser = await createTestUser(
			{
				email: 'testuser@example.com',
				name: 'Test User',
				role: 'user'
			},
			CONNECTION_ID
		);

		otherUser = await createTestUser(
			{
				email: 'otheruser@example.com',
				name: 'Other User',
				role: 'user'
			},
			CONNECTION_ID
		);

		// Create test organization
		organization = await createTestOrganization(
			{
				name: 'Test Organization',
				slug: 'test-org'
			},
			CONNECTION_ID
		);

		// Set up organization membership
		await createTestMembership(
			{
				organizationId: organization.id,
				userId: testUser.id,
				role: 'owner'
			},
			CONNECTION_ID
		);

		await createTestMembership(
			{
				organizationId: organization.id,
				userId: otherUser.id,
				role: 'member'
			},
			CONNECTION_ID
		);

		// Create a test object for update/delete tests
		testObject = await createTestExampleObject(
			{
				name: 'Test Object',
				description: 'Test Description',
				userId: testUser.id,
				organizationId: organization.id
			},
			CONNECTION_ID
		);
	}

	function createFormData(data: Record<string, string>): { formData: () => Promise<FormData> } {
		const formData = new FormData();
		Object.entries(data).forEach(([key, value]) => {
			formData.set(key, value);
		});

		return {
			formData: () => Promise.resolve(formData)
		};
	}

	describe('Load Function', () => {
		test('loads user objects with organization filtering', async () => {
			const mockLocals = { user: testUser };

			const result = await load({
				locals: mockLocals
			} as unknown as Parameters<typeof load>[0]);

			expect(result).toHaveProperty('examples');
			expect(result).toHaveProperty('organizationId', organization.id);
			const typedResult = result as { examples: TestExampleObject[]; organizationId: string };
			expect(typedResult.examples).toHaveLength(1);
			expect(typedResult.examples[0].name).toBe('Test Object');
			expect(typedResult.examples[0].userId).toBe(testUser.id);
		});

		test('loads only user-specific objects', async () => {
			// Create another object owned by different user in same org
			await createTestExampleObject(
				{
					name: 'Other User Object',
					description: 'Other Description',
					userId: otherUser.id,
					organizationId: organization.id
				},
				CONNECTION_ID
			);

			const mockLocals = { user: testUser };

			const result = await load({
				locals: mockLocals
			} as unknown as Parameters<typeof load>[0]);

			const typedResult = result as { examples: TestExampleObject[]; organizationId: string };
			// Should only return objects owned by testUser, not otherUser
			expect(typedResult.examples).toHaveLength(1);
			expect(typedResult.examples[0].name).toBe('Test Object');
			expect(typedResult.examples[0].userId).toBe(testUser.id);
		});

		test('handles user without organization membership', async () => {
			// Create user without organization membership
			const noOrgUser = await createTestUser(
				{
					email: 'noorg@example.com',
					name: 'No Org User',
					role: 'user'
				},
				CONNECTION_ID
			);

			const mockLocals = { user: noOrgUser };

			const result = await load({
				locals: mockLocals
			} as unknown as Parameters<typeof load>[0]);

			const typedResult = result as { examples: TestExampleObject[]; organizationId: null };
			expect(typedResult.examples).toEqual([]);
			expect(typedResult.organizationId).toBeNull();
		});

		test('handles database errors gracefully', async () => {
			// Mock database error by passing invalid user
			const invalidUser = { id: 'invalid-user-id' } as TestUser;

			await expect(
				load({
					locals: { user: invalidUser }
				} as unknown as Parameters<typeof load>[0])
			).rejects.toThrow();
		});
	});

	describe('Create Action', () => {
		test('creates object with valid data', async () => {
			const mockRequest = createFormData({
				name: 'New Test Object',
				description: 'New test description'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toHaveProperty('success', true);
			expect(result).toHaveProperty('created');
			const createResult = result as { success: boolean; created: TestExampleObject };
			expect(createResult.created.name).toBe('New Test Object');
			expect(createResult.created.description).toBe('New test description');
			expect(createResult.created.userId).toBe(testUser.id);
			expect(createResult.created.organizationId).toBe(organization.id);
		});

		test('creates object without description', async () => {
			const mockRequest = createFormData({
				name: 'Object Without Description'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toHaveProperty('success', true);
			const createResult = result as { success: boolean; created: TestExampleObject };
			expect(createResult.created.name).toBe('Object Without Description');
			expect(createResult.created.description).toBe('');
		});

		test('validates required name field', async () => {
			const mockRequest = createFormData({
				name: '',
				description: 'Description without name'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toEqual(
				fail(400, {
					data: { name: '', description: 'Description without name' },
					errors: { name: ['Name is required.'] }
				})
			);
		});

		test('validates empty string name (whitespace only)', async () => {
			const mockRequest = createFormData({
				name: '   ', // Only whitespace
				description: 'Test description'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toEqual(
				fail(400, {
					data: { name: '   ', description: 'Test description' },
					errors: { name: ['Name is required.'] }
				})
			);
		});

		test('associates object with user organization', async () => {
			const mockRequest = createFormData({
				name: 'Org Associated Object',
				description: 'Test description'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			const typedResult = result as { success: boolean; created: TestExampleObject };
			expect(typedResult.success).toBe(true);
			expect(typedResult.created.organizationId).toBe(organization.id);
			expect(typedResult.created.userId).toBe(testUser.id);
		});

		test('handles user without organization', async () => {
			// Create user without organization membership
			const noOrgUser = await createTestUser(
				{
					email: 'noorg-create@example.com',
					name: 'No Org User Create',
					role: 'user'
				},
				CONNECTION_ID
			);

			const mockRequest = createFormData({
				name: 'No Org Object',
				description: 'Created by user without org'
			});

			const result = await actions.create({
				request: mockRequest,
				locals: { user: noOrgUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			const typedResult = result as { success: boolean; created: TestExampleObject };
			expect(typedResult.success).toBe(true);
			expect(typedResult.created.organizationId).toBeNull();
			expect(typedResult.created.userId).toBe(noOrgUser.id);
		});
	});

	describe('Update Action', () => {
		test('updates owned object successfully', async () => {
			const mockRequest = createFormData({
				id: testObject.id.toString(),
				name: 'Updated Test Object',
				description: 'Updated description'
			});

			const result = await actionsById.update({
				request: mockRequest,
				locals: { user: testUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.update>[0]);

			expect(result).toHaveProperty('success', true);
			expect(result).toHaveProperty('updated');
			const updateResult = result as { success: boolean; updated: TestExampleObject };
			expect(updateResult.updated.name).toBe('Updated Test Object');
			expect(updateResult.updated.description).toBe('Updated description');
			expect(updateResult.updated.userId).toBe(testUser.id);
		});

		test('prevents update of objects not owned by user', async () => {
			const mockRequest = createFormData({
				id: testObject.id.toString(),
				name: 'Unauthorized Update',
				description: 'Should fail'
			});

			const result = await actionsById.update({
				request: mockRequest,
				locals: { user: otherUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.update>[0]);

			// Should fail because otherUser doesn't own testObject
			expect(result).toHaveProperty('status', 404);
			expect(result).toHaveProperty('data');
			const failResult = result as { status: number; data: { message: string } };
			expect(failResult.data).toHaveProperty(
				'message',
				'Example object not found or access denied for update.'
			);
		});
	});

	describe('Delete Action', () => {
		test('deletes owned object successfully', async () => {
			const mockLocals = { user: testUser };
			const mockParams = { id: testObject.id.toString() };

			// The delete action should succeed and redirect
			try {
				await actionsById.remove({
					locals: mockLocals,
					params: mockParams
				} as unknown as Parameters<typeof actionsById.remove>[0]);
				// If we get here without an error, the deletion succeeded
				// In a real environment, it would redirect, but in tests it might not
			} catch (error) {
				// Check if it's a redirect (which is expected for successful deletion)
				const err = error as { status?: number; location?: string };
				if (err && err.status === 303 && err.location === '/examples/crud') {
					// This is expected - successful deletion redirects
					return;
				}
				// If it's not a redirect, re-throw the error
				throw error;
			}

			// Verify the object was deleted from database
			const deletedObject = await db
				.select()
				.from(exampleObjectsTable)
				.where(eq(exampleObjectsTable.id, testObject.id));
			expect(deletedObject).toHaveLength(0);
		});

		test('prevents delete of objects not owned by user', async () => {
			const mockLocals = { user: otherUser };
			const mockParams = { id: testObject.id.toString() };

			try {
				await actionsById.remove({
					locals: mockLocals,
					params: mockParams
				} as unknown as Parameters<typeof actionsById.remove>[0]);
				// Should not reach here
				expect(true).toBe(false);
			} catch (error) {
				// Expect a 404 error
				const err = error as { status?: number; body?: { message?: string } };
				expect(err.status).toBe(404);
				if (err.body && err.body.message) {
					expect(err.body.message).toContain('Example object not found or access denied');
				}
			}
		});
	});

	describe('Load By ID Function', () => {
		test('prevents access to objects not owned by user', async () => {
			// Load object details page for object owned by testUser, but accessed by otherUser
			const mockLocals = { user: otherUser };
			const mockParams = { id: testObject.id.toString() };

			try {
				await loadById({
					locals: mockLocals,
					params: mockParams
				} as unknown as Parameters<typeof loadById>[0]);
				// Should not reach here
				expect(true).toBe(false);
			} catch (error) {
				// Expect a 404 error
				const err = error as { status?: number; body?: { message?: string } };
				expect(err.status).toBe(404);
				if (err.body && err.body.message) {
					expect(err.body.message).toContain('Example object not found or access denied');
				}
			}
		});

		test('loads object details for owner', async () => {
			const mockLocals = { user: testUser };
			const mockParams = { id: testObject.id.toString() };

			const result = await loadById({
				locals: mockLocals,
				params: mockParams
			} as unknown as Parameters<typeof loadById>[0]);

			expect(result).toHaveProperty('exampleObject');
			const typedResult = result as { exampleObject: TestExampleObject };
			expect(typedResult.exampleObject.id).toBe(testObject.id);
			expect(typedResult.exampleObject.name).toBe('Test Object');
			expect(typedResult.exampleObject.userId).toBe(testUser.id);
		});
	});
});
