import { expect, test } from '../../../fixtures/user.fixture'; // Import extended test from fixture

// These tests will use the authenticated page provided by the fixture
test.describe('Authenticated Layout & Basic Routing', () => {
	// Before each test, verify we're actually authenticated by checking the URL
	test.beforeEach(async ({ page }) => {
		// Use standard page fixture
		// Access a protected page directly - fixture should handle login
		await page.goto('/home');

		// Verify we're on a protected page (fixture should ensure this)
		await expect(page).toHaveURL('/home');
	});

	test('should redirect authenticated user from root to home page', async ({ page }) => {
		// Use standard page
		// Go to the root URL - we're already authenticated via fixture
		await page.goto('/');

		// Should be redirected to home
		await expect(page).toHaveURL('/home');
	});

	test('should allow authenticated access to protected routes', async ({ page }) => {
		// Use standard page
		// We've already verified auth in beforeEach, but let's try another protected route
		await page.goto('/history'); // Use /history as another example

		// Should have access (no redirect)
		await expect(page).toHaveURL('/history');
	});

	// Add other tests that require authentication and test shared layout elements
});
