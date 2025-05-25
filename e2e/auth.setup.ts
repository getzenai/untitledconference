import { expect, test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRE_REGISTERED_TEST_EMAIL, PRE_REGISTERED_TEST_PASSWORD } from './globals';
import { testUserManager } from './test-user-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
	console.log('[Auth Setup] Creating and authenticating test user via API...');

	try {
		// Check if user already exists, if not create them
		const userExists = await testUserManager.userExists(PRE_REGISTERED_TEST_EMAIL);

		let testUser;
		if (!userExists) {
			console.log('[Auth Setup] Creating test user via API...');
			testUser = await testUserManager.createTestUser({
				email: PRE_REGISTERED_TEST_EMAIL,
				password: PRE_REGISTERED_TEST_PASSWORD
			});
		} else {
			console.log('[Auth Setup] Test user already exists, logging in...');
			testUser = await testUserManager.loginUser(
				PRE_REGISTERED_TEST_EMAIL,
				PRE_REGISTERED_TEST_PASSWORD
			);
		}

		// Establish browser session via UI login (don't create user again)
		await page.goto('/login');
		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(PRE_REGISTERED_TEST_PASSWORD);
		await page.getByRole('button', { name: 'Login' }).click();

		// Wait for successful navigation
		await page.waitForURL('/home', { timeout: 10000 });

		console.log('[Auth Setup] Successfully authenticated via API and browser');

		// Verify we're on the home page
		await expect(page).toHaveURL('/home', { timeout: 10000 });
		console.log('[Auth Setup] Confirmed navigation to /home');

		// Save the authentication state for reuse in authenticated tests
		await page.context().storageState({ path: authFile });
		console.log(`[Auth Setup] Authentication state saved to ${authFile}`);
	} catch (error) {
		console.error(`[Auth Setup] Authentication failed: ${error}`);
		throw new Error(`[Auth Setup] Failed to create/authenticate test user: ${error}`);
	}
});
