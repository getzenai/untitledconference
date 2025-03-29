import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { hash } from '@node-rs/argon2';
import { encodeBase32LowerCase } from '@oslojs/encoding';
import { eq, like } from 'drizzle-orm';
import { TEST_USER_EMAIL_PREFIX } from './globals';

// Use a fixed connection string for e2e tests
// This should match your local development database
const connectionString = 'postgres://root:mysecretpassword@localhost:5432/local';
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

// Prefix for test users to easily identify them

export async function cleanupDatabase() {
	console.log('Cleaning up test database...');
	// Delete all sessions first (due to foreign key constraint)
	await db.delete(schema.session);

	// Delete all users
	await db.delete(schema.user);
	console.log('Database cleaned successfully');
}

/**
 * Cleans up only test users and their related data
 * instead of clearing the entire database tables
 */
export async function cleanupTestUsers() {
	console.log('Cleaning up test users...');

	// Find all test users (those with email starting with the test prefix)
	const testUsers = await db
		.select()
		.from(schema.user)
		.where(like(schema.user.email, `${TEST_USER_EMAIL_PREFIX}%`));

	// Delete sessions for test users first (due to foreign key constraint)
	for (const user of testUsers) {
		await db.delete(schema.session).where(eq(schema.session.userId, user.id));
	}

	// Delete all test users
	await db.delete(schema.user).where(like(schema.user.email, `${TEST_USER_EMAIL_PREFIX}%`));

	console.log(`Cleaned up ${testUsers.length} test users successfully`);
}

/**
 * Creates a test user directly in the database
 */
export async function createTestUser(email: string, password: string) {
	// Ensure test users have a prefix for easy identification and cleanup
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
	const [user] = await db
		.insert(schema.user)
		.values({
			id: userId,
			email: testEmail,
			passwordHash
		})
		.returning();

	return user;
}

/**
 * Generates a user ID for testing
 */
function generateUserId() {
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	const id = encodeBase32LowerCase(bytes);
	return id;
}
