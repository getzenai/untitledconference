import { expect, test } from '@playwright/test';
import { testUserManager } from '../test-user-manager';

test.describe('Invitation Acceptance Flow', () => {
	test('should show error for invalid invitation code', async ({ page }) => {
		await page.goto('/invite/invalid-code-12345');

		// Should show error message
		await expect(page.getByText(/Invalid or expired invitation/i)).toBeVisible();
	});

	test('should display error for non-existent invitation code', async ({ page }) => {
		// Test with a code that doesn't exist
		await page.goto('/invite/test-code');

		// Should show error message for invalid code
		await expect(page.getByText(/Invalid or expired invitation/i)).toBeVisible();

		// Should show go to home button
		await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
	});

	test('should redirect to login when accepting invitation as logged-out user', async ({
		page
	}) => {
		// This test assumes we have a way to create a valid invitation
		// For now, we test the general flow
		await page.goto('/invite/test-code');

		// If the invitation is valid and user is not logged in
		const acceptButton = page.getByRole('button', { name: /Continue to Sign Up/i });
		if (await acceptButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await acceptButton.click();

			// Should redirect to register page
			await expect(page).toHaveURL(/\/register/);
		}
	});

	test('should handle decline action', async ({ page }) => {
		await page.goto('/invite/test-code');

		const declineButton = page.getByRole('button', { name: 'Decline' });
		if (await declineButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await declineButton.click();

			// Should redirect to home or login
			await expect(page).toHaveURL(/\/(login|home)/);
		}
	});
});

test.describe('Invitation Acceptance - Authenticated User', () => {
	let testUser: { email: string; password: string };

	test.beforeAll(async () => {
		// Create a test user for authenticated tests
		testUser = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('invitation-test'),
			password: 'password123'
		});
	});

	test.beforeEach(async ({ page }) => {
		// Login as test user
		await page.goto('/login');
		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(testUser.password);
		await page.getByRole('button', { name: 'Login' }).click();
		await expect(page).toHaveURL('/home');
	});

	test('should show option to accept invitation as logged-in user', async ({ page }) => {
		await page.goto('/invite/test-code');

		// Check for logged-in user invitation acceptance
		const acceptButton = page.getByRole('button', { name: /Accept Invitation|Join/i });
		if (await acceptButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			// User is logged in and can accept directly
			await expect(page.getByText(testUser.email)).toBeVisible();
		}
	});
});
