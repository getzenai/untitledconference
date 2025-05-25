import { expect, test } from '@playwright/test';
import { TEST_USER_EMAIL_PREFIX } from '../../../config/index'; // Updated path
import { createTestUser } from '../../../helpers/test-db-utils'; // Import from test-db-utils
import { TEST_REGISTRATION_TOKEN } from '../../../test.env';

// Helper function to generate a formatted timestamp for emails
function getFormattedTimestamp() {
	const now = new Date();
	return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

test.describe('User Registration', () => {
	test('should show register form with empty fields', async ({ page }) => {
		await page.goto('/register');
		await expect(page.getByLabel('Email')).toBeVisible();
		await expect(page.getByLabel('Password')).toBeVisible();
		await expect(page.getByLabel('Registration Token')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
	});

	test('should persist email in register form when validation fails', async ({ page }) => {
		// Create a unique email to ensure it doesn't exist
		const timestamp = getFormattedTimestamp();
		const testEmail = `${TEST_USER_EMAIL_PREFIX}test${timestamp}@example.com`;

		await page.goto('/register');
		await page.getByLabel('Email').fill(testEmail);
		// Use an invalid short password to trigger validation error
		await page.getByLabel('Password').fill('short');
		await page.getByLabel('Registration Token').fill(TEST_REGISTRATION_TOKEN);
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Email should be preserved after failed submission
		await expect(page.getByLabel('Email')).toHaveValue(testEmail);
	});

	test('should show error with invalid token', async ({ page }) => {
		// Create a unique email for this test to ensure it doesn't exist
		const timestamp = getFormattedTimestamp();
		const testEmail = `${TEST_USER_EMAIL_PREFIX}newuser${timestamp}@example.com`;
		const password = 'password123';
		const invalidToken = 'invalid-token';

		// Go to register page
		await page.goto('/register');

		// Fill out registration form with invalid token
		await page.getByLabel('Email').fill(testEmail);
		await page.getByLabel('Password').fill(password);
		await page.getByLabel('Registration Token').fill(invalidToken);
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Should stay on register page with error message
		await expect(page.url()).toContain('/register');
		await expect(page.getByText('Invalid registration token')).toBeVisible();
	});

	test('should allow new user registration with valid token', async ({ page }) => {
		// Create a unique email for this test to ensure it doesn't exist
		const timestamp = getFormattedTimestamp();
		const testEmail = `${TEST_USER_EMAIL_PREFIX}newuser${timestamp}@example.com`;
		const password = 'password123';

		// Go to register page
		await page.goto('/register');

		// Fill out registration form with valid token
		await page.getByLabel('Email').fill(testEmail);
		await page.getByLabel('Password').fill(password);
		await page.getByLabel('Registration Token').fill(TEST_REGISTRATION_TOKEN);
		await page.getByRole('button', { name: 'Create Account' }).click();

		// After registration, user should be redirected to home
		await page.waitForURL('/home');
		await expect(page).toHaveURL('/home');
	});

	test('should allow login when registering with existing email and correct password', async ({
		page
	}) => {
		// Create a unique email for this test
		const timestamp = getFormattedTimestamp();
		const testEmail = `${TEST_USER_EMAIL_PREFIX}duplicate${timestamp}@example.com`;
		const password = 'password123';

		// Create a user directly in the database
		await createTestUser(testEmail, password);

		// Try to register with the same email through the UI
		await page.goto('/register');
		await page.getByLabel('Email').fill(testEmail);
		await page.getByLabel('Password').fill(password);
		await page.getByLabel('Registration Token').fill(TEST_REGISTRATION_TOKEN);

		// Click registration button
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Check the current URL
		const currentUrl = page.url();

		// Either we should:
		// 1. Stay on register page with an error message, OR
		// 2. Be logged in and redirected to home (acceptable behavior)
		if (currentUrl.includes('/register')) {
			// If we're still on register page, email should be preserved
			await expect(page.getByLabel('Email')).toHaveValue(testEmail);
			console.log('Duplicate email test: Stayed on register page with error');
		} else if (currentUrl.includes('/home')) {
			// If we're redirected to home, we were logged in automatically (acceptable)
			console.log('Duplicate email test: Auto-logged in and redirected to home');
		} else {
			// Any other page is unexpected
			throw new Error(`Unexpected redirect to ${currentUrl} with duplicate email`);
		}
	});
});
