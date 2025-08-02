import { expect, test } from '@playwright/test';

test.describe('Examples sidebar', () => {
	test('should show the sidebar on /examples/crud', async ({ page }) => {
		await page.goto('/examples/crud');

		// Check that the sidebar is visible
		const sidebar = page.getByTestId('app-sidebar');
		await expect(sidebar).toBeVisible();

		// Wait for the sidebar to be fully loaded
		await sidebar.getByText('Platform').waitFor({ state: 'visible' });

		// Find and click the Examples trigger to expand the section
		const examplesTrigger = sidebar.getByTestId('toggle-examples');
		await expect(examplesTrigger).toBeVisible();

		// Click to expand the Examples section
		await examplesTrigger.click();

		// Wait a bit for the animation
		await page.waitForTimeout(500);

		// Check for the links directly within the sidebar using text content
		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).toBeVisible();

		const toastLink = sidebar.getByRole('link', { name: 'Toast' });
		await expect(toastLink).toBeVisible();

		const dragDropLink = sidebar.getByRole('link', { name: 'Drag & Drop' });
		await expect(dragDropLink).toBeVisible();

		// Check that the active link is highlighted
		await expect(crudLink).toHaveAttribute('data-active', 'true');
		await expect(toastLink).not.toHaveAttribute('data-active', 'true');
	});

	test('should show the sidebar on /examples/toast and highlight the active link', async ({
		page
	}) => {
		await page.goto('/examples/toast');

		// Check that the sidebar is visible
		const sidebar = page.getByTestId('app-sidebar');
		await expect(sidebar).toBeVisible();

		// Wait for the sidebar to be fully loaded
		await sidebar.getByText('Platform').waitFor({ state: 'visible' });

		// Find and click the Examples trigger to expand the section
		const examplesTrigger = sidebar.getByTestId('toggle-examples');
		await expect(examplesTrigger).toBeVisible();

		// Click to expand the Examples section
		await examplesTrigger.click();

		// Wait a bit for the animation
		await page.waitForTimeout(500);

		// Check that the active link is highlighted
		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).not.toHaveAttribute('data-active', 'true');

		const toastLink = sidebar.getByRole('link', { name: 'Toast' });
		await expect(toastLink).toHaveAttribute('data-active', 'true');
	});

	test('should navigate between example pages and update active state', async ({ page }) => {
		await page.goto('/examples/crud');

		const sidebar = page.getByTestId('app-sidebar');

		// Wait for the sidebar to be fully loaded
		await sidebar.getByText('Platform').waitFor({ state: 'visible' });

		// Find and click the Examples trigger to expand the section
		const examplesTrigger = sidebar.getByTestId('toggle-examples');
		await expect(examplesTrigger).toBeVisible();

		// Click to expand the Examples section
		await examplesTrigger.click();

		// Wait a bit for the animation
		await page.waitForTimeout(500);

		// Click on the toast link
		const toastLink = sidebar.getByRole('link', { name: 'Toast' });
		await toastLink.click();

		await expect(page).toHaveURL('/examples/toast');

		// Verify active states changed
		const crudLink = sidebar.getByRole('link', { name: 'CRUD' });
		await expect(crudLink).not.toHaveAttribute('data-active', 'true');
		await expect(toastLink).toHaveAttribute('data-active', 'true');
	});
});
