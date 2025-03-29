import { expect, test } from '@playwright/test';

test.describe('Route Protection and Redirection - Unauthenticated', () => {
	test('should redirect unauthenticated user from root to login page', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL('/login');
	});

	test('should block unauthenticated access to protected routes', async ({ page }) => {
		// Try to access a protected route directly
		await page.goto('/home');

		// Should be redirected to login with returnTo parameter
		await expect(page.url()).toContain('/login?returnTo=/home');
	});
});
