/**
 * CRUD Operations Server Actions Tests
 *
 * Covers the example CRUD route as it exists today (superforms + zod4):
 * - Load function with organization filtering
 * - Create action (`?/create` on the list page)
 * - Update / Delete actions (`?/update`, `?/delete` on the `[id]` page)
 * - Error handling and edge cases
 *
 * NOTE: the actions call `superValidate(event, ...)`, which only parses a form
 * body from a real `Request` instance. A `{ formData() }` stub is silently
 * treated as a plain data object and yields an empty, invalid form, so every
 * helper below builds an actual `Request`.
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

/** Shape of the superforms `fail()` payloads returned by these actions. */
interface FormFailure {
	status: number;
	data: {
		form: {
			valid: boolean;
			errors: { name?: string[]; description?: string[]; _errors?: string[] };
			data: { name: string; description?: string };
		};
	};
}

/** Shape of the plain `fail()` payload returned by the delete action. */
interface MessageFailure {
	status: number;
	data: { message: string };
}

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
		await closeTestDatabase(CONNECTION_ID);
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

	function createFormRequest(data: Record<string, string>, url = 'http://localhost/examples/crud') {
		const formData = new FormData();
		Object.entries(data).forEach(([key, value]) => {
			formData.set(key, value);
		});

		return new Request(url, { method: 'POST', body: formData });
	}

	async function findObjectById(id: number) {
		const [row] = await db.select().from(exampleObjectsTable).where(eq(exampleObjectsTable.id, id));
		return row;
	}

	describe('Load Function', () => {
		test('loads user objects with organization filtering', async () => {
			const mockLocals = { user: testUser };

			const result = await load({
				locals: mockLocals
			} as unknown as Parameters<typeof load>[0]);

			expect(result).toHaveProperty('examples');
			expect(result).toHaveProperty('organizationId', organization.id);
			// The superforms refactor made `load` also return an empty create form
			expect(result).toHaveProperty('form');
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

		test('returns an empty list for an unknown user id instead of throwing', async () => {
			// An id matching no user is not a database error: both queries return no rows
			const invalidUser = { id: 'invalid-user-id' } as TestUser;

			const result = await load({
				locals: { user: invalidUser }
			} as unknown as Parameters<typeof load>[0]);

			const typedResult = result as { examples: TestExampleObject[]; organizationId: null };
			expect(typedResult.examples).toEqual([]);
			expect(typedResult.organizationId).toBeNull();
		});

		test('converts unexpected errors into a 500', async () => {
			// No user on locals makes the membership query throw, which the catch
			// block converts into a SvelteKit 500 error
			await expect(
				load({ locals: {} } as unknown as Parameters<typeof load>[0])
			).rejects.toMatchObject({
				status: 500,
				body: { message: 'Failed to load example objects.' }
			});
		});
	});

	describe('Create Action', () => {
		test('creates object with valid data', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: 'New Test Object',
					description: 'New test description'
				}),
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
			const result = await actions.create({
				request: createFormRequest({
					name: 'Object Without Description'
				}),
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toHaveProperty('success', true);
			const createResult = result as { success: boolean; created: TestExampleObject };
			expect(createResult.created.name).toBe('Object Without Description');
			expect(createResult.created.description).toBe('');
		});

		test('validates required name field', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: '',
					description: 'Description without name'
				}),
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			// superforms returns the whole form back inside `fail(400, { form })`
			const failure = result as unknown as FormFailure;
			expect(failure.status).toBe(400);
			expect(failure.data.form.valid).toBe(false);
			expect(failure.data.form.errors.name).toEqual(['Name is required']);
			expect(failure.data.form.data.description).toBe('Description without name');

			// Nothing should have been written
			const rows = await db
				.select()
				.from(exampleObjectsTable)
				.where(eq(exampleObjectsTable.userId, testUser.id));
			expect(rows).toHaveLength(1);
		});

		test('rejects a whitespace-only name', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: '   ',
					description: 'Test description'
				}),
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			const failure = result as unknown as FormFailure;
			expect(failure.status).toBe(400);
			expect(failure.data.form.errors.name).toEqual(['Name is required']);

			// Nothing should have been written
			const rows = await db
				.select()
				.from(exampleObjectsTable)
				.where(eq(exampleObjectsTable.userId, testUser.id));
			expect(rows).toHaveLength(1);
		});

		test('trims surrounding whitespace from the persisted name', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: '  Padded Name  ',
					description: 'Test description'
				}),
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			expect(result).toHaveProperty('success', true);
			const createResult = result as { success: boolean; created: TestExampleObject };
			expect(createResult.created.name).toBe('Padded Name');

			const persisted = await findObjectById(createResult.created.id);
			expect(persisted.name).toBe('Padded Name');
		});

		test('rejects a name longer than 100 characters', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: 'a'.repeat(101)
				}),
				locals: { user: testUser }
			} as unknown as Parameters<typeof actions.create>[0]);

			const failure = result as unknown as FormFailure;
			expect(failure.status).toBe(400);
			expect(failure.data.form.errors.name).toEqual(['Name must be less than 100 characters']);
		});

		test('associates object with user organization', async () => {
			const result = await actions.create({
				request: createFormRequest({
					name: 'Org Associated Object',
					description: 'Test description'
				}),
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

			const result = await actions.create({
				request: createFormRequest({
					name: 'No Org Object',
					description: 'Created by user without org'
				}),
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
			const result = await actionsById.update({
				request: createFormRequest(
					{
						name: 'Updated Test Object',
						description: 'Updated description'
					},
					`http://localhost/examples/crud/${testObject.id}`
				),
				locals: { user: testUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.update>[0]);

			// The action returns `{ form, success: true }`; the saved row is echoed back
			// through `form.data` rather than a separate `updated` property
			expect(result).toHaveProperty('success', true);
			const updateResult = result as unknown as {
				success: boolean;
				form: { data: { name: string; description?: string } };
			};
			expect(updateResult.form.data.name).toBe('Updated Test Object');
			expect(updateResult.form.data.description).toBe('Updated description');

			const persisted = await findObjectById(testObject.id);
			expect(persisted.name).toBe('Updated Test Object');
			expect(persisted.description).toBe('Updated description');
			expect(persisted.userId).toBe(testUser.id);
		});

		test('rejects invalid form data with a 400', async () => {
			const result = await actionsById.update({
				request: createFormRequest({ name: '' }, `http://localhost/examples/crud/${testObject.id}`),
				locals: { user: testUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.update>[0]);

			const failure = result as unknown as FormFailure;
			expect(failure.status).toBe(400);
			expect(failure.data.form.errors.name).toEqual(['Name is required']);

			// Original row untouched
			const persisted = await findObjectById(testObject.id);
			expect(persisted.name).toBe('Test Object');
		});

		test('prevents update of objects not owned by user', async () => {
			const result = await actionsById.update({
				request: createFormRequest(
					{
						name: 'Unauthorized Update',
						description: 'Should fail'
					},
					`http://localhost/examples/crud/${testObject.id}`
				),
				locals: { user: otherUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.update>[0]);

			// Should fail because otherUser doesn't own testObject. The message now
			// lives on `form.errors._errors` so superforms can surface it in the UI
			const failure = result as unknown as FormFailure;
			expect(failure.status).toBe(404);
			expect(failure.data.form.errors._errors).toEqual([
				'Example object not found or access denied'
			]);

			// Original row untouched
			const persisted = await findObjectById(testObject.id);
			expect(persisted.name).toBe('Test Object');
		});

		test('rejects a non-numeric id with a 400', async () => {
			await expect(
				actionsById.update({
					request: createFormRequest(
						{ name: 'Whatever' },
						'http://localhost/examples/crud/not-a-number'
					),
					locals: { user: testUser },
					params: { id: 'not-a-number' }
				} as unknown as Parameters<typeof actionsById.update>[0])
			).rejects.toMatchObject({
				status: 400,
				body: { message: 'Invalid Example ID format.' }
			});
		});
	});

	describe('Delete Action', () => {
		test('deletes owned object and redirects', async () => {
			// A successful delete throws a SvelteKit redirect rather than returning
			await expect(
				actionsById.delete({
					locals: { user: testUser },
					params: { id: testObject.id.toString() }
				} as unknown as Parameters<typeof actionsById.delete>[0])
			).rejects.toMatchObject({
				status: 303,
				location: '/examples/crud'
			});

			// Verify the object was deleted from database
			const deletedObject = await db
				.select()
				.from(exampleObjectsTable)
				.where(eq(exampleObjectsTable.id, testObject.id));
			expect(deletedObject).toHaveLength(0);
		});

		test('prevents delete of objects not owned by user', async () => {
			// Ownership failures are returned as `fail(404, { message })`, not thrown
			const result = await actionsById.delete({
				locals: { user: otherUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof actionsById.delete>[0]);

			const failure = result as unknown as MessageFailure;
			expect(failure.status).toBe(404);
			expect(failure.data.message).toContain('Example object not found or access denied');

			// The object must still exist
			const persisted = await findObjectById(testObject.id);
			expect(persisted).toBeDefined();
			expect(persisted.userId).toBe(testUser.id);
		});
	});

	describe('Load By ID Function', () => {
		test('prevents access to objects not owned by user', async () => {
			// Load object details page for object owned by testUser, accessed by otherUser
			await expect(
				loadById({
					locals: { user: otherUser },
					params: { id: testObject.id.toString() }
				} as unknown as Parameters<typeof loadById>[0])
			).rejects.toMatchObject({
				status: 404,
				body: { message: 'Example object not found or access denied' }
			});
		});

		test('loads object details for owner', async () => {
			const result = await loadById({
				locals: { user: testUser },
				params: { id: testObject.id.toString() }
			} as unknown as Parameters<typeof loadById>[0]);

			expect(result).toHaveProperty('exampleObject');
			const typedResult = result as {
				exampleObject: TestExampleObject;
				form: { data: { name: string; description?: string } };
			};
			expect(typedResult.exampleObject.id).toBe(testObject.id);
			expect(typedResult.exampleObject.name).toBe('Test Object');
			expect(typedResult.exampleObject.userId).toBe(testUser.id);

			// The form is pre-filled with the existing values for the edit page
			expect(typedResult.form.data.name).toBe('Test Object');
			expect(typedResult.form.data.description).toBe('Test Description');
		});
	});
});
