import { expect, test } from '@playwright/test';

// These tests will use the authenticated state set up by auth.setup.ts
test.describe('Authenticated Routing', () => {
	// Before each test, verify we're actually authenticated
	test.beforeEach(async ({ page }) => {
		// Access a protected page directly - should succeed if we're authenticated
		await page.goto('/home');

		// Verify we're on a protected page
		await expect(page).toHaveURL('/home');
	});

	test('should redirect authenticated user from root to home page', async ({ page }) => {
		// Go to the root URL - we're already authenticated
		await page.goto('/');

		// Should be redirected to home
		await expect(page).toHaveURL('/home');
	});

	test('should allow authenticated access to protected routes', async ({ page }) => {
		// We've already verified auth in beforeEach, but let's try another protected route
		await page.goto('/home');

		// Should have access (no redirect)
		await expect(page).toHaveURL('/home');
	});

	// Add other tests that require authentication
});
