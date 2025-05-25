import { test as baseTest, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TEST_USER_EMAIL_PREFIX } from '../config/index';
import { createTestUser, deleteUserAndData } from '../helpers/test-db-utils';

export { expect } from '@playwright/test';

// Define types for fixtures
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type MyTestFixtures = {}; // Use {} for no test-scoped fixtures

type MyWorkerFixtures = {
	workerStorageState: string; // Path to the auth file for the worker
	workerUserId: string; // The ID of the user created for this worker
};

// Extend the base test with our fixture types
export const test = baseTest.extend<MyTestFixtures, MyWorkerFixtures>({
	// Worker-scoped fixture to set up authentication state AND userId once per worker.
	workerStorageState: [
		async ({ browser }, use) => {
			const workerId = test.info().parallelIndex;
			const authDir = path.resolve(test.info().project.outputDir || 'test-results', '.auth');
			const authFile = path.join(authDir, `worker-${workerId}.json`);
			const userIdFile = path.join(authDir, `worker-${workerId}.userid.txt`); // File to store userId

			fs.mkdirSync(authDir, { recursive: true });

			// If auth file exists, validate it before reusing
			if (fs.existsSync(authFile)) {
				let isValid = false;
				const context = await browser.newContext({
					storageState: authFile,
					baseURL: 'http://localhost:5173' // Ensure baseURL is set for validation navigation
				});
				try {
					// Try to navigate to a simple protected page
					const page = await context.newPage();

					await page.goto('/home', { waitUntil: 'domcontentloaded', timeout: 10000 }); // Increased timeout slightly

					// Check if we're still on /home (not redirected to login)
					const url = page.url();
					if (url.includes('/home')) {
						isValid = true;
					}
					await page.close();
				} catch (error) {
					console.error(
						`[Worker ${workerId}] Error during auth state validation navigation:`,
						error
					);
					isValid = false; // Assume invalid if navigation fails
				} finally {
					await context.close(); // Ensure context is always closed
				}

				if (isValid) {
					await use(authFile);
					return;
				} else {
					// Delete invalid files
					try {
						fs.unlinkSync(authFile);
						if (fs.existsSync(userIdFile)) fs.unlinkSync(userIdFile);
					} catch (unlinkError) {
						console.error(
							`[Worker ${workerId}] Error deleting invalid auth/userId files:`,
							unlinkError
						);
					}
				}
			}

			// --- Authentication and User Creation (if no valid state found) ---
			const context = await browser.newContext({
				storageState: undefined,
				baseURL: 'http://localhost:5173'
			});
			const page = await context.newPage();

			const email = `${TEST_USER_EMAIL_PREFIX}worker${workerId}-${crypto.randomUUID()}@example.com`;
			const password = 'password123';
			let userId: string | undefined;

			try {
				const user = await createTestUser(email, password);
				if (!user) {
					throw new Error(
						`Worker ${workerId} fixture setup failed: Could not create test user ${email}.`
					);
				}
				userId = user.id; // Store the created user ID

				// Save the userId to the dedicated file
				if (typeof userId !== 'string') {
					throw new Error(
						`Worker ${workerId} fixture setup failed: userId is undefined after user creation.`
					);
				}
				fs.writeFileSync(userIdFile, userId);

				await page.goto('/login');
				await page.getByLabel('Email').fill(email);
				await page.getByLabel('Password').fill(password);

				await page.getByRole('button', { name: 'Login' }).click();

				// Original check for successful navigation
				await page.waitForURL('/home', { timeout: 15000 });
				await expect(page.getByRole('link', { name: 'History' })).toBeVisible(); // Verify login success

				await page.context().storageState({ path: authFile });
				await page.close();
				await context.close();
				await use(authFile); // Pass the path to the saved state file
			} catch (error) {
				// Clean up user if created before error
				if (userId) {
					await deleteUserAndData(userId);
					// Attempt to remove the userId file as well
					if (fs.existsSync(userIdFile)) fs.unlinkSync(userIdFile);
				}
				if (page && !page.isClosed()) await page.close();
				if (context) await context.close();
				throw error;
			}
			// Note: Successful user cleanup for worker users is handled by global.teardown.ts
			// Global teardown should also ideally clean up any lingering .userid.txt files
		},
		{ scope: 'worker' }
	],

	// Worker-scoped fixture to provide the userId created by workerStorageState
	workerUserId: [
		async (
			{
				workerStorageState:
					_workerStorageState /* eslint-disable-line @typescript-eslint/no-unused-vars -- Fixture dependency */
			},
			use
		) => {
			// Depend on workerStorageState to ensure it runs first
			// workerStorageState fixture dependency ensures the files are created/exist first
			const workerId = test.info().parallelIndex;
			const authDir = path.resolve(test.info().project.outputDir || 'test-results', '.auth');
			const userIdFile = path.join(authDir, `worker-${workerId}.userid.txt`);

			if (!fs.existsSync(userIdFile)) {
				// This should ideally not happen if workerStorageState ran correctly
				throw new Error(
					`[Worker ${workerId}] User ID file not found at ${userIdFile}. Authentication might have failed.`
				);
			}

			const userId = fs.readFileSync(userIdFile, 'utf-8');
			await use(userId);
		},
		{ scope: 'worker' }
	],

	// Override storageState test fixture to use the worker-specific state path.
	// This ensures that `page` and `context` fixtures provided to tests are authenticated.
	storageState: async ({ workerStorageState: _workerStorageState }, use) => {
		// Prefix unused var
		// The actual value is passed through the dependency mechanism, we just need the fixture signature
		await use(_workerStorageState);
	}
});
