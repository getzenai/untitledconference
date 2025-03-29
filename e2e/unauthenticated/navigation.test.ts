import { expect, test } from '@playwright/test';

test.describe('Authentication Page Navigation', () => {
	test('should navigate between login and register pages', async ({ page }) => {
		await page.goto('/login');
		await page.getByRole('link', { name: 'Register' }).click();
		await expect(page).toHaveURL('/register');

		await page.getByRole('link', { name: 'Login' }).click();
		await expect(page).toHaveURL('/login');
	});
});
