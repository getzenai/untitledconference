// import { hash } from '@node-rs/argon2'; // Removed
// import { encodeBase32LowerCase } from '@oslojs/encoding'; // Removed
import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/auth-schema.ts';
import { TEST_USER_EMAIL_PREFIX } from './globals';

// Use TEST_DATABASE_URL for tests, with fallback to localhost test database (never dev database)
const connectionString =
	process.env.TEST_DATABASE_URL || 'postgres://root:mysecretpassword@localhost:5433/test';
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export async function cleanupDatabase() {
	console.log('Cleaning up test database (Better Auth schema)...');
	try {
		// Order matters due to foreign key constraints if not using CASCADE effectively
		// or if wanting to be explicit.
		// `session` and `account` tables reference `user.id` with ON DELETE CASCADE.
		// `verification` does not have an explicit FK to user in the provided schema.

		await db.delete(schema.verification);
		console.log('Deleted verification tokens.');

		// Deleting users should cascade to sessions and accounts due to schema definition.
		await db.delete(schema.user);
		console.log('Deleted users (sessions and accounts should cascade).');

		// As a fallback or explicit step, ensure session and account are empty if cascade didn't occur or to be sure.
		// These might error if cascade worked and tables are already empty or if user table was deleted first without cascade.
		// For robustness with ON DELETE CASCADE, just deleting users should be enough for user-related data.
		// If issues persist, uncomment these:
		// await db.delete(schema.session);
		// console.log('Deleted sessions explicitly.');
		// await db.delete(schema.account);
		// console.log('Deleted accounts explicitly.');

		console.log('Database cleaned successfully (Better Auth schema).');
	} catch (error) {
		console.error('Error during database cleanup:', error);
		// Optionally re-throw or handle if tests should not proceed
	}
}

/**
 * Cleans up only test users and their related data
 * This function needs careful review based on how verification tokens are linked
 * and if granular cleanup is preferred over full DB reset for tests.
 */
export async function cleanupTestUsers() {
	console.log('Cleaning up test users (Better Auth schema)...');
	try {
		const testUsers = await db // Corrected: removed duplicate line below
			.select({ id: schema.user.id, email: schema.user.email })
			.from(schema.user)
			.where(like(schema.user.email, `${TEST_USER_EMAIL_PREFIX}%`));
		if (testUsers.length === 0) {
			console.log('[Cleanup] No test users found with prefix to clean up.');
			return;
		}
		console.log(
			`[Cleanup] Found ${testUsers.length} test users to clean:`,
			testUsers.map((u) => u.email)
		);

		// Delete verification tokens (assuming identifier might be email or related)
		for (const user of testUsers) {
			if (user.email) {
				console.log(`[Cleanup] Attempting to delete verification for ${user.email}`);
				await db.delete(schema.verification).where(eq(schema.verification.identifier, user.email));
			}
		}
		console.log('[Cleanup] Attempted to clean verification tokens for test users.');

		// Deleting users will cascade to their sessions and accounts due to ON DELETE CASCADE.
		console.log(`[Cleanup] Attempting to delete ${testUsers.length} user records...`);
		await db.delete(schema.user).where(like(schema.user.email, `${TEST_USER_EMAIL_PREFIX}%`));

		console.log(
			`[Cleanup] Cleaned up ${testUsers.length} test users and their related data successfully.`
		);
	} catch (error) {
		console.error('[Cleanup] Error during test user cleanup:', error);
	}
}

// Obsolete: createTestUser function is removed as test users should be pre-registered via UI
// or a dedicated seeding mechanism compatible with Better Auth.
// export async function createTestUser(email: string, password: string) { ... }

// Obsolete: generateUserId function was a helper for createTestUser
// function generateUserId() { ... }
