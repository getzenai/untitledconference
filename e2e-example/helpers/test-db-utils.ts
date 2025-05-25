import { hash } from '@node-rs/argon2';
import { encodeBase32LowerCase } from '@oslojs/encoding';
import { eq, inArray, like } from 'drizzle-orm'; // Removed and, ne
import type { AnalysisJob } from '../../src/lib/server/db/schema';
import * as schema from '../../src/lib/server/db/schema';
import { GLOBAL_TEST_USER_EMAIL, TEST_USER_EMAIL_PREFIX } from '../config/index';
import { db } from './db-client'; // Import db from the core client file

/**
 * Cleans up the entire test database (USE WITH CAUTION)
 */
export async function cleanupDatabase() {
	// console.log('Cleaning up entire test database...'); // Reduce noise
	// Delete jobs first due to foreign key
	await db.delete(schema.analysisJobs);
	// Delete sessions
	await db.delete(schema.session);
	// Delete users
	await db.delete(schema.user);
	// console.log('Database cleaned successfully'); // Reduce noise
}

/**
 * Cleans up only test users (identified by email prefix) and their related data.
 * Includes the global auth user. Use for global setup/teardown.
 */
export async function cleanupTestUsers() {
	// console.log('Cleaning up test users and related data...'); // Reduce noise

	// Find all test users based on prefix (including the global auth user for setup/teardown cleanup)
	const testUsers = await db
		.select({ id: schema.user.id }) // Select only ID
		.from(schema.user)
		.where(like(schema.user.email, `${TEST_USER_EMAIL_PREFIX}%`)); // Reverted: Find all matching prefix

	const testUserIds = testUsers.map((u) => u.id);

	if (testUserIds.length > 0) {
		// console.log(`Found test user IDs for cleanup: ${testUserIds.join(', ')}`); // Reduce noise

		// Delete analysis jobs for ALL found test users first
		await db // Remove assignment and returning
			.delete(schema.analysisJobs)
			.where(inArray(schema.analysisJobs.userId, testUserIds));
		// console.log(`Deleted analysis jobs for test users.`); // Simplified log if needed

		// Delete sessions for test users
		await db // Remove assignment and returning
			.delete(schema.session)
			.where(inArray(schema.session.userId, testUserIds));
		// console.log(`Deleted sessions for test users.`); // Simplified log if needed

		// Delete the test users themselves
		await db // Remove assignment and returning
			.delete(schema.user)
			.where(inArray(schema.user.id, testUserIds));
		// console.log(`Deleted test users.`); // Simplified log if needed
	} else {
		// console.log('No test users found with the specified prefix.'); // Reduce noise
	}

	// console.log(`Cleanup process for test users completed.`); // Reduce noise
}

/**
 * Cleans up only analysis jobs for a specific user ID.
 */
export async function cleanupTestUserJobs(userId: string) {
	// console.log(`Cleaning up analysis jobs for user ID: ${userId}`); // Reduce noise
	try {
		await db // Remove assignment and returning
			.delete(schema.analysisJobs)
			.where(eq(schema.analysisJobs.userId, userId));
		// console.log(`   Deleted analysis jobs for user ${userId}.`); // Simplified log if needed
	} catch (error) {
		console.error(`🔴 Error cleaning jobs for user ID ${userId}:`, error);
	}
}

/**
 * Creates a test user directly in the database.
 */
export async function createTestUser(email: string, password: string): Promise<schema.User> {
	// Add return type Promise<schema.User>
	// console.log(`Attempting to create user: ${email}`);
	const testEmail = email.startsWith(TEST_USER_EMAIL_PREFIX)
		? email
		: `${TEST_USER_EMAIL_PREFIX}${email}`;

	const passwordHash = await hash(password, {
		memoryCost: 19456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});

	const userId = generateUserId();
	try {
		const result = await db
			.insert(schema.user)
			.values({
				id: userId,
				email: testEmail,
				passwordHash
			})
			.returning();

		if (!result || result.length === 0) {
			throw new Error(`User creation failed for ${testEmail}, no record returned.`);
		}
		// console.log(`✅ Successfully created user ${testEmail} with ID: ${userId}`); // Keep success minimal if needed
		return result[0]; // Return the created user object
	} catch (err) {
		console.error(`🔴 Error during DB insert for user ${testEmail}:`, err);
		throw err; // Re-throw the error after logging
	}
} // Correct closing brace for function
// Removed extra closing brace here

/**
 * Retrieves the user ID for the globally defined test user.
 */
export async function getGlobalTestUserId(): Promise<string> {
	const user = await db.query.user.findFirst({
		where: eq(schema.user.email, GLOBAL_TEST_USER_EMAIL)
	});
	if (!user) {
		throw new Error(`Global test user ${GLOBAL_TEST_USER_EMAIL} not found in DB.`);
	}
	return user.id;
}

/**
 * Generates a user ID for testing.
 */
function generateUserId() {
	// Check if crypto is available (should be in Node.js >= 19 or secure contexts)
	if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
		console.warn('crypto.getRandomValues not available. Falling back to pseudo-random generation.');
		// Basic fallback (not cryptographically secure, but okay for test IDs)
		return (
			'fallback_' +
			Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15)
		);
	}
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	const id = encodeBase32LowerCase(bytes);
	return id;
}

/**
 * Creates a test analysis job directly in the database.
 */
export async function createTestJob(userId: string, data: Partial<AnalysisJob>) {
	// console.log(`Creating test job for user ${userId} with data:`, data); // Reduce noise
	try {
		const [job] = await db
			.insert(schema.analysisJobs)
			.values({
				userId: userId,
				status: data.status ?? 'pending',
				urls: data.urls ?? ['https://default.example.com'],
				result: data.result,
				error_details: data.error_details,
				// Pass Date object directly; Drizzle handles conversion
				created_at: data.created_at // Pass Date object or undefined
				// updated_at will use default
			})
			.returning();
		// console.log(`Created test job with ID: ${job.id}`); // Reduce noise
		return job;
	} catch (error) {
		console.error(`🔴 Error creating test job for user ${userId}:`, error);
		throw error;
	}
}

/**
 * Deletes a specific user and all their associated data (jobs, sessions).
 * Intended for use in test fixture teardown.
 */
export async function deleteUserAndData(userId: string) {
	if (!userId) {
		console.warn('Attempted to delete user with undefined or null ID. Skipping.');
		return;
	}
	// console.log(`🧹 Cleaning up data for specific user ID: ${userId}`); // Reduce noise
	try {
		// Delete jobs first (foreign key dependency)
		await db // Remove assignment and returning
			.delete(schema.analysisJobs)
			.where(eq(schema.analysisJobs.userId, userId));
		// console.log(`   Deleted analysis jobs for user ${userId}.`); // Simplified log if needed

		// Delete sessions
		await db // Remove assignment and returning
			.delete(schema.session)
			.where(eq(schema.session.userId, userId));
		// console.log(`   Deleted sessions for user ${userId}.`); // Simplified log if needed

		// Delete the user
		await db // Remove assignment and returning
			.delete(schema.user)
			.where(eq(schema.user.id, userId));
		// console.log(`   Deleted user record for ID ${userId}.`); // Simplified log if needed

		// console.log(`✅ Finished cleanup for user ID: ${userId}`); // Reduce noise
	} catch (error) {
		console.error(`🔴 Error during cleanup for user ID ${userId}:`, error);
		// Decide if you want to re-throw or just log
		// throw error;
	}
}
