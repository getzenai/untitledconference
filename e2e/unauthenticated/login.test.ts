import { expect, test } from '@playwright/test';
import { TEST_USER_EMAIL_PREFIX } from '../globals';
import { testUserManager } from '../test-user-manager';

function getFormattedTimestamp() {
	const now = new Date();
	return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

test.describe('User Login', () => {
	test('should show login form with empty fields', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	});

	test('should persist email in login form when validation fails', async ({ page }) => {
		const nonExistentEmail = `${TEST_USER_EMAIL_PREFIX}nonexistent@example.com`;

		await page.goto('/login');
		await page.getByLabel('Email').fill(nonExistentEmail);
		await page.getByLabel('Password').fill('wrongpassword');
		await page.getByRole('button', { name: 'Login' }).click();

		await expect(page.getByLabel('Email')).toHaveValue(nonExistentEmail);
	});

	test('should allow login with valid credentials', async ({ page }) => {
		// Create a test user first via API since this is in the unauthenticated suite
		// and doesn't have access to the pre-registered user
		const testUser = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('login-test'),
			password: 'password123'
		});

		// Now test the login flow via browser (don't create user again)
		await page.goto('/login');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(testUser.password);
		await page.getByRole('button', { name: 'Login' }).click();

		// Wait for network requests to complete and then navigation
		await page.waitForLoadState('networkidle');
		await expect(page).toHaveURL('/home', { timeout: 15000 });
	});

	test('should show error message when login fails with incorrect credentials', async ({
		page
	}) => {
		const timestamp = getFormattedTimestamp();
		const nonExistentEmail = `${TEST_USER_EMAIL_PREFIX}nonexistent${timestamp}@example.com`;

		await page.goto('/login');
		await page.getByLabel('Email').fill(nonExistentEmail);
		await page.getByLabel('Password').fill('wrongpassword');
		await page.getByRole('button', { name: 'Login' }).click();

		await expect(page).toHaveURL('/login');

		await expect(page.locator('.text-sm.text-red-500')).toBeVisible();
		await expect(page.locator('.text-sm.text-red-500')).toHaveText(
			/user not found|invalid credentials|Invalid email or password/i
		);
		await expect(page.getByLabel('Email')).toHaveValue(nonExistentEmail);
	});

	// Cleanup any users created during this test file
	test.afterAll(async () => {
		await testUserManager.cleanupCreatedUsers();
	});
});
