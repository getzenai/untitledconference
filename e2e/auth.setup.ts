import { expect, test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRE_REGISTERED_TEST_EMAIL, PRE_REGISTERED_TEST_PASSWORD } from './globals';
import { testUserManager } from './test-user-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
	try {
		// Always try to create the user first to ensure organization is created
		let testUser;
		try {
			testUser = await testUserManager.createTestUser({
				email: PRE_REGISTERED_TEST_EMAIL,
				password: PRE_REGISTERED_TEST_PASSWORD,
				organizationName: 'Test Organization'
			});
		} catch (error) {
			// If user already exists, just log in
			const errorMessage = String(error);
			if (errorMessage.includes('already exists') || errorMessage.includes('Registration failed')) {
				testUser = await testUserManager.loginUser(
					PRE_REGISTERED_TEST_EMAIL,
					PRE_REGISTERED_TEST_PASSWORD
				);
			} else {
				throw error;
			}
		}

		// Establish browser session via UI login (don't create user again)
		await page.goto('/login');
		// Wait for page to be fully loaded with JavaScript
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(PRE_REGISTERED_TEST_PASSWORD);
		await page.getByRole('button', { name: 'Login' }).click();

		// Wait for successful navigation
		await page.waitForURL('/home', { timeout: 10000 });

		// Verify we're on the home page
		await expect(page).toHaveURL('/home', { timeout: 10000 });

		// Save the authentication state for reuse in authenticated tests
		await page.context().storageState({ path: authFile });
	} catch (error) {
		console.error(`[Auth Setup] Authentication failed: ${error}`);
		throw new Error(`[Auth Setup] Failed to create/authenticate test user: ${error}`);
	}
});
