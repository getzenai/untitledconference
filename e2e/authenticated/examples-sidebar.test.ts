import { expect, test } from '@playwright/test';

test.describe('Examples sidebar', () => {
	test('should show the sidebar on /examples/crud', async ({ page }) => {
		await page.goto('/examples/crud');

		// Check that the sidebar is visible
		const sidebar = page.getByRole('navigation');
		await expect(sidebar).toBeVisible();

		// Check that the sidebar has the correct links
		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).toBeVisible();
		await expect(crudLink).toHaveAttribute('href', '/examples/crud');

		const toastLink = sidebar.getByRole('link', { name: 'Toast' });
		await expect(toastLink).toBeVisible();
		await expect(toastLink).toHaveAttribute('href', '/examples/toast');

		// Check that the active link is highlighted
		await expect(crudLink).toHaveClass(/bg-muted/);
		await expect(toastLink).not.toHaveClass(/bg-muted/);
	});

	test('should show the sidebar on /examples/toast and highlight the active link', async ({
		page
	}) => {
		await page.goto('/examples/toast');

		// Check that the sidebar is visible
		const sidebar = page.getByRole('navigation');
		await expect(sidebar).toBeVisible();

		// Check that the active link is highlighted
		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).not.toHaveClass(/bg-muted/);

		const toastLink = sidebar.getByRole('link', { name: 'Toast' });
		await expect(toastLink).toHaveClass(/bg-muted/);
	});

	test('should navigate between example pages and update active state', async ({ page }) => {
		await page.goto('/examples/crud');

		const sidebar = page.getByRole('navigation');
		const toastLink = sidebar.getByRole('link', { name: 'Toast' });

		await toastLink.click();

		await expect(page).toHaveURL('/examples/toast');

		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).not.toHaveClass(/bg-muted/);
		await expect(toastLink).toHaveClass(/bg-muted/);
	});

	test('should not show the sidebar on /home', async ({ page }) => {
		await page.goto('/home');

		const sidebar = page.getByRole('navigation');
		await expect(sidebar).not.toBeVisible();
	});
});
