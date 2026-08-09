/**
 * Shared constants and helpers for the Cypress E2E suite.
 *
 * Every test user's email starts with TEST_USER_EMAIL_PREFIX so the
 * `cleanupTestUsers` task can delete them with a single prefix match.
 */
export const TEST_USER_EMAIL_PREFIX = 'e2e-test-';

export const DEFAULT_TEST_PASSWORD = 'Test123!';

export interface TestUser {
	id: string;
	email: string;
	password: string;
	token?: string;
}

/**
 * Generate a unique test user email. Timestamp + random suffix keeps users
 * unique even when several specs run back to back against the same database.
 */
export function generateTestUserEmail(prefix = 'user'): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${TEST_USER_EMAIL_PREFIX}${prefix}-${timestamp}-${random}@example.com`;
}
