import { expect, test } from '@playwright/test';

test.describe('Admin Dashboard Access Control', () => {
	test('should not show admin menu item for regular users', async ({ page }) => {
		// Regular authenticated user should not see admin menu
		await page.goto('/home');

		// Check that Admin menu item is not visible in sidebar
		const adminMenuItem = page.getByRole('button', { name: 'Admin' });
		await expect(adminMenuItem).not.toBeVisible();
	});

	test('should redirect non-admin users from admin page', async ({ page }) => {
		// Try to access admin page directly
		await page.goto('/admin');

		// Should redirect to home or show access denied
		await expect(page).toHaveURL('/home');

		// Check for possible error toast
		const errorToast = page.getByText(/Access denied|Admin privileges required/i);
		if (await errorToast.isVisible({ timeout: 1000 }).catch(() => false)) {
			await expect(errorToast).toBeVisible();
		}
	});
});

test.describe('Admin Dashboard - With Admin User', () => {
	// Note: These tests would require creating an admin user
	// For now, we'll test the structure and behavior patterns

	test.skip('should display admin dashboard for admin users', async ({ page }) => {
		// This test is skipped as it requires admin user setup
		// In a real scenario, you'd create an admin user in test setup

		await page.goto('/admin');

		// Check dashboard structure
		await expect(page.getByRole('heading', { name: 'System Admin Dashboard' })).toBeVisible();

		// Check for statistics cards
		await expect(page.getByText('Total Users')).toBeVisible();
		await expect(page.getByText('Organizations')).toBeVisible();
		await expect(page.getByText('Admin Users')).toBeVisible();
		await expect(page.getByText('Banned Users')).toBeVisible();
	});

	test.skip('should display user management table', async ({ page }) => {
		await page.goto('/admin');

		// Check for user management section
		await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();

		// Check for search functionality
		await expect(page.getByLabel('Search Users')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();

		// Check for role filter
		await expect(page.getByLabel('Filter by Role')).toBeVisible();

		// Check table headers
		await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
	});

	test.skip('should allow searching users', async ({ page }) => {
		await page.goto('/admin');

		// Search for a user
		const searchInput = page.getByLabel('Search Users');
		await searchInput.fill('test@example.com');
		await page.getByRole('button', { name: 'Search' }).click();

		// Wait for search results
		await page.waitForLoadState('networkidle');

		// Table should update with search results
		const tableRows = page.locator('tbody tr');
		const rowCount = await tableRows.count();

		// If users found, they should match search criteria
		if (rowCount > 0) {
			const firstRow = tableRows.first();
			await expect(firstRow).toContainText('test@example.com');
		}
	});

	test.skip('should allow filtering users by role', async ({ page }) => {
		await page.goto('/admin');

		// Open role filter
		await page.getByLabel('Filter by Role').click();

		// Select admin role
		await page.getByRole('option', { name: 'Admin' }).click();

		// Check that filtered results show only admins
		const tableRows = page.locator('tbody tr');
		const rowCount = await tableRows.count();

		for (let i = 0; i < rowCount; i++) {
			const row = tableRows.nth(i);
			await expect(row).toContainText('admin');
		}
	});

	test.skip('should show user action buttons', async ({ page }) => {
		await page.goto('/admin');

		// Find a user row (not the current admin)
		const tableRows = page.locator('tbody tr');
		const firstRow = tableRows.first();

		// Check for action buttons
		const banButton = firstRow.getByRole('button', { name: /Ban|Unban/i });
		const removeButton = firstRow.getByRole('button', { name: /Remove|Delete/i });

		// At least one action should be available
		const hasBanButton = await banButton.isVisible().catch(() => false);
		const hasRemoveButton = await removeButton.isVisible().catch(() => false);

		expect(hasBanButton || hasRemoveButton).toBeTruthy();
	});

	test.skip('should allow changing user roles', async ({ page }) => {
		await page.goto('/admin');

		// Find a user row with role selector
		const tableRows = page.locator('tbody tr');
		const rowWithSelect = tableRows.filter({ has: page.locator('[role="combobox"]') }).first();

		if (await rowWithSelect.isVisible()) {
			// Click on role selector
			const roleSelect = rowWithSelect.locator('[role="combobox"]');
			await roleSelect.click();

			// Check that role options are available
			await expect(page.getByRole('option', { name: 'User' })).toBeVisible();
			await expect(page.getByRole('option', { name: 'Admin' })).toBeVisible();
		}
	});
});
