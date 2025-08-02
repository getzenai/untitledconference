import { Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/auth-schema';
import { cleanupTestUsers, db } from './db';
import { TEST_USER_EMAIL_PREFIX } from './globals';

export interface TestUser {
	id: string;
	email: string;
	password: string;
	token?: string;
}

export class TestUserManager {
	private static instance: TestUserManager;
	private createdUsers: Set<string> = new Set();
	private baseUrl: string;

	private constructor() {
		this.baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174';
	}

	static getInstance(): TestUserManager {
		if (!TestUserManager.instance) {
			TestUserManager.instance = new TestUserManager();
		}
		return TestUserManager.instance;
	}

	/**
	 * Generate a unique test user email with timestamp and random suffix
	 */
	generateTestUserEmail(prefix = 'user'): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		return `${TEST_USER_EMAIL_PREFIX}${prefix}-${timestamp}-${random}@example.com`;
	}

	/**
	 * Create a test user via API
	 */
	async createTestUser(
		options: {
			email?: string;
			password?: string;
		} = {}
	): Promise<TestUser> {
		const email = options.email || this.generateTestUserEmail();
		const password = options.password || 'password123';

		console.log(`[TestUserManager] Creating test user via API: ${email}`);

		const response = await fetch(`${this.baseUrl}/api/v1/test/register`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email, password })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Registration failed: ${error.error || response.statusText}`);
		}

		const result = await response.json();

		// Track created user for cleanup
		this.createdUsers.add(email);

		console.log(`[TestUserManager] Successfully created user via API: ${email}`);
		return {
			id: result.user.id,
			email: result.user.email,
			password
		};
	}

	/**
	 * Login with user credentials via API
	 */
	async loginUser(email: string, password: string): Promise<TestUser> {
		console.log(`[TestUserManager] Logging in user via API: ${email}`);

		const response = await fetch(`${this.baseUrl}/api/v1/public/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email, password })
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Login failed: ${error.error || response.statusText}`);
		}

		const result = await response.json();

		console.log(`[TestUserManager] Successfully logged in via API: ${email}`);
		return {
			id: result.user.id,
			email: result.user.email,
			password,
			token: result.token
		};
	}

	/**
	 * Logout user via API
	 */
	async logoutUser(token: string): Promise<void> {
		console.log('[TestUserManager] Logging out user via API');

		const response = await fetch(`${this.baseUrl}/api/v1/public/logout`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Logout failed: ${error.error || response.statusText}`);
		}

		console.log('[TestUserManager] Successfully logged out via API');
	}

	/**
	 * Check if a user exists in the database
	 */
	async userExists(email: string): Promise<boolean> {
		try {
			const user = await db
				.select({ id: schema.user.id })
				.from(schema.user)
				.where(eq(schema.user.email, email))
				.limit(1);

			return user.length > 0;
		} catch (error) {
			console.error(`[TestUserManager] Error checking user existence: ${error}`);
			return false;
		}
	}

	/**
	 * Attempt to create a test user, handling both success and failure cases
	 */
	async attemptCreateTestUser(
		options: {
			email?: string;
			password?: string;
		} = {}
	): Promise<{ user: TestUser; success: boolean }> {
		try {
			const user = await this.createTestUser(options);
			return { user, success: true };
		} catch (error) {
			console.log(`[TestUserManager] Registration failed: ${error}`);
			return {
				user: {
					id: '',
					email: options.email || '',
					password: options.password || 'password123'
				},
				success: false
			};
		}
	}

	/**
	 * Create a test user and navigate to authenticated state in browser
	 */
	async createAndLoginUser(
		page: Page,
		options: {
			email?: string;
			password?: string;
		} = {}
	): Promise<TestUser> {
		// Create user via API
		const user = await this.createTestUser(options);

		// Login via API to get token
		const loginResult = await this.loginUser(user.email, user.password);

		// Set authentication state in browser by using UI login
		await page.goto('/login');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('Email').fill(user.email);
		await page.getByLabel('Password').fill(user.password);
		await page.getByRole('button', { name: 'Login' }).click();

		// Wait for network requests to complete and then navigation
		await page.waitForLoadState('networkidle');
		await page.waitForURL('/home', { timeout: 15000 });

		return { ...user, token: loginResult.token };
	}

	/**
	 * Clean up users created during this test session
	 */
	async cleanupCreatedUsers(): Promise<void> {
		if (this.createdUsers.size === 0) {
			console.log('[TestUserManager] No users to cleanup');
			return;
		}

		console.log(`[TestUserManager] Cleaning up ${this.createdUsers.size} created users`);

		try {
			for (const email of this.createdUsers) {
				await db.delete(schema.user).where(eq(schema.user.email, email));
			}

			this.createdUsers.clear();
			console.log('[TestUserManager] Successfully cleaned up created users');
		} catch (error) {
			console.error(`[TestUserManager] Error during user cleanup: ${error}`);
		}
	}

	/**
	 * Clean up all test users (for global cleanup)
	 */
	async cleanupAllTestUsers(): Promise<void> {
		await cleanupTestUsers();
		this.createdUsers.clear();
	}

	/**
	 * Reset the manager state
	 */
	reset(): void {
		this.createdUsers.clear();
	}
}

// Export singleton instance
export const testUserManager = TestUserManager.getInstance();
