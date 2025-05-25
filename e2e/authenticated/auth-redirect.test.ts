import { expect, test } from '@playwright/test';

test.describe('Authenticated User Redirects', () => {
	test.beforeEach(async ({ page }) => {
		// Verify we're authenticated by accessing a protected page
		await page.goto('/home');
		await expect(page).toHaveURL('/home');
	});

	test('should redirect authenticated user from login page to home', async ({ page }) => {
		// Try to access login page while authenticated
		await page.goto('/login');

		// Should be redirected to home page
		await expect(page).toHaveURL('/home', { timeout: 5000 });
	});

	test('should redirect authenticated user from register page to home', async ({ page }) => {
		// Try to access register page while authenticated
		await page.goto('/register');

		// Should be redirected to home page
		await expect(page).toHaveURL('/home', { timeout: 5000 });
	});

	test('should redirect authenticated user from login page with returnTo parameter', async ({
		page
	}) => {
		// Try to access login page with returnTo parameter while authenticated
		await page.goto('/login?returnTo=/some-protected-route');

		// Should be redirected to home page (ignoring returnTo since user is already authenticated)
		await expect(page).toHaveURL('/home', { timeout: 5000 });
	});
});
