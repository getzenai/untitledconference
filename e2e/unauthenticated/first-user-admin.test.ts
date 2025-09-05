import { expect, test } from '@playwright/test';
import { testUserManager } from '../test-user-manager';

test.describe('First User Admin Assignment', () => {
	test.skip('first registered user should automatically become admin', async ({ page }) => {
		// Clean up any existing users first
		await testUserManager.cleanupAllTestUsers();

		// Generate unique test email (must start with e2e-test- for cleanup)
		const testEmail = `e2e-test-first-admin-${Date.now()}@example.com`;
		const testPassword = 'TestPassword123!';

		// Navigate to register page
		await page.goto('/register');

		// Check for first user indicator
		await expect(
			page.getByText(
				/You'll be the first user and will automatically become the system administrator/i
			)
		).toBeVisible();

		// Register as first user
		await page.fill('input[type="email"]', testEmail);
		await page.fill('input[type="password"]', testPassword);
		await page.click('button[type="submit"]');

		// Should be redirected to home after registration
		await page.waitForURL('/home');

		// Log out and log back in to get a fresh session with the updated role
		await page.getByRole('button', { name: 'Logout' }).click();
		await page.waitForURL('/login');

		// Log back in
		await page.fill('input[type="email"]', testEmail);
		await page.fill('input[type="password"]', testPassword);
		await page.getByRole('button', { name: 'Login' }).click();
		await page.waitForURL('/home');

		// Navigate directly to admin users page to test admin access
		await page.goto('/admin/users');
		await page.waitForURL('/admin/users');

		// Should see admin dashboard
		await expect(page.getByText('System Admin Dashboard')).toBeVisible();

		// Check that the user appears in the table with admin role
		await expect(page.getByText(testEmail)).toBeVisible();

		// Clean up
		await testUserManager.cleanupCreatedUsers();
	});

	test('second registered user should not become admin', async ({ page }) => {
		// Assuming first user already exists from previous test or setup

		// Generate unique test email (must start with e2e-test- for cleanup)
		const testEmail = `e2e-test-regular-user-${Date.now()}@example.com`;
		const testPassword = 'TestPassword123!';

		// Navigate to register page
		await page.goto('/register');

		// Should not see first user indicator
		await expect(
			page.getByText(
				/You'll be the first user and will automatically become the system administrator/i
			)
		).not.toBeVisible();

		// Should see regular registration description
		await expect(page.getByText('Enter your details to create your account')).toBeVisible();

		// Register as regular user
		await page.fill('input[type="email"]', testEmail);
		await page.fill('input[type="password"]', testPassword);
		await page.click('button[type="submit"]');

		// Should be redirected to home after registration
		await page.waitForURL('/home');

		// Check that Admin menu is NOT visible in sidebar
		await page.waitForTimeout(1000); // Wait for sidebar to load
		const adminSection = page.locator('[data-testid="app-sidebar"]').getByText('Admin');
		await expect(adminSection).not.toBeVisible();

		// Try to access admin page directly
		await page.goto('/admin/users');

		// Should be redirected away from admin page
		await expect(page).not.toHaveURL('/admin/users');
		await expect(page).toHaveURL('/home');

		// Clean up
		await testUserManager.cleanupCreatedUsers();
	});
});

test.describe('Admin Impersonation Feature', () => {
	test.skip('admin should be able to impersonate regular user', async () => {
		// This test needs a proper setup with an admin user and a regular user
		// Currently skipped as it requires authentication setup
		// TODO: Implement proper test setup:
		// 1. Create/login as admin user
		// 2. Create a regular user to impersonate
		// 3. Test impersonation flow
		// 4. Verify banner appears
		// 5. Test stop impersonating
	});
});
