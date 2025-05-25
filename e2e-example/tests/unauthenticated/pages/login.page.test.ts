import { expect, test } from '@playwright/test';
import { TEST_USER_EMAIL_PREFIX } from '../../../config/index'; // Updated path
import { createTestUser } from '../../../helpers/test-db-utils'; // Import from test-db-utils

// Helper function to generate a formatted timestamp for emails
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
		// Use an email that doesn't exist
		const nonExistentEmail = `${TEST_USER_EMAIL_PREFIX}nonexistent@example.com`;

		await page.goto('/login');
		await page.getByLabel('Email').fill(nonExistentEmail);
		await page.getByLabel('Password').fill('wrongpassword');
		await page.getByRole('button', { name: 'Login' }).click();

		// Email should be preserved after failed submission
		await expect(page.getByLabel('Email')).toHaveValue(nonExistentEmail);
	});

	test('should allow login with valid credentials', async ({ page }) => {
		// Create a unique email for this test
		const timestamp = getFormattedTimestamp();
		const testEmail = `${TEST_USER_EMAIL_PREFIX}login${timestamp}@example.com`;
		const password = 'password123';

		// Create a user directly in the database
		await createTestUser(testEmail, password);

		// Go to login page
		await page.goto('/login');

		// Fill out login form
		await page.getByLabel('Email').fill(testEmail);
		await page.getByLabel('Password').fill(password);
		await page.getByRole('button', { name: 'Login' }).click();

		// After login, user should be redirected to home
		await expect(page).toHaveURL('/home');
	});

	test('should show error when login fails', async ({ page }) => {
		// Use a unique email that won't exist in the database
		const timestamp = getFormattedTimestamp();
		const nonExistentEmail = `${TEST_USER_EMAIL_PREFIX}nonexistent${timestamp}@example.com`;

		await page.goto('/login');
		await page.getByLabel('Email').fill(nonExistentEmail);
		await page.getByLabel('Password').fill('wrongpassword');
		await page.getByRole('button', { name: 'Login' }).click();

		// Should remain on login page
		await expect(page).toHaveURL('/login');

		// Email should be preserved after failed submission
		await expect(page.getByLabel('Email')).toHaveValue(nonExistentEmail);
	});
});
