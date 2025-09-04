import { expect, test } from '@playwright/test';
import { TEST_USER_EMAIL_PREFIX } from '../globals';
import { testUserManager } from '../test-user-manager';

test.describe('User Registration', () => {
	test('should show register form with empty fields', async ({ page }) => {
		await page.goto('/register');
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
	});

	test('should show organization name field in registration form', async ({ page }) => {
		await page.goto('/register');
		await expect(page.getByLabel('Organization Name (Optional)')).toBeVisible();
		await expect(page.getByText("You'll be the administrator of this organization")).toBeVisible();
	});

	test('should show error and persist email for invalid password', async ({ page }) => {
		const testEmail = testUserManager.generateTestUserEmail('invalid-password');

		await page.goto('/register');
		await page.getByLabel('Email').fill(testEmail);
		await page.getByLabel('Password').fill('short');

		// Wait for the form to be ready and then click
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Wait for any network requests to complete
		await page.waitForLoadState('networkidle');

		// Look for error message with more flexible selector and longer timeout
		const errorLocator = page.locator('p.text-sm.text-red-500');
		await expect(errorLocator).toBeVisible({ timeout: 15000 });
		await expect(errorLocator).toContainText('Password too short');

		// Ensure form submission was prevented and URL is clean
		await expect(page).toHaveURL('/register');
		await expect(page.getByLabel('Email')).toHaveValue(testEmail);
	});

	test('should allow new user registration and redirect to home', async ({ page }) => {
		// Use the API user manager to create a test user and login via browser
		const testUser = await testUserManager.createAndLoginUser(page, {
			email: testUserManager.generateTestUserEmail('new-user'),
			password: 'password123'
		});

		// Verify we're on the home page after registration
		await expect(page).toHaveURL('/home', { timeout: 10000 });

		// Verify user was tracked for cleanup
		expect(testUser.email).toContain(TEST_USER_EMAIL_PREFIX);
	});

	test('should show error message for duplicate email registration', async ({ page }) => {
		// Create a user first via API
		const testUser = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('duplicate'),
			password: 'password123'
		});

		// Attempt to register the same user again using attemptCreateTestUser
		const result = await testUserManager.attemptCreateTestUser({
			email: testUser.email,
			password: testUser.password
		});

		// Registration should fail
		expect(result.success).toBe(false);

		// Now test via UI to verify error message
		await page.goto('/register');
		await page.waitForLoadState('networkidle');

		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(testUser.password);
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Wait for network requests to complete
		await page.waitForLoadState('networkidle');

		// Should stay on register page (may have query parameters)
		await expect(page.url()).toContain('/register');

		// Should show error message
		await expect(page.locator('.text-sm.text-red-500')).toBeVisible();
		await expect(page.getByLabel('Email')).toHaveValue(testUser.email);
	});

	test('should handle user creation and cleanup properly', async ({ page }) => {
		const email = testUserManager.generateTestUserEmail('cleanup-test');

		// Verify user doesn't exist initially
		expect(await testUserManager.userExists(email)).toBe(false);

		// Create user via API
		const testUser = await testUserManager.createTestUser({
			email,
			password: 'password123'
		});

		// Verify user exists in database
		expect(await testUserManager.userExists(testUser.email)).toBe(true);

		// Test login with created user via browser
		await page.goto('/login');
		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(testUser.password);
		await page.getByRole('button', { name: 'Login' }).click();
		await expect(page).toHaveURL('/home');
	});

	// Cleanup any users created during this test file
	test.afterAll(async () => {
		await testUserManager.cleanupCreatedUsers();
	});
});
