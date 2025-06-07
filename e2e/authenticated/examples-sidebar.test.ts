import { expect, test } from '@playwright/test';

test.describe('Examples sidebar', () => {
	test('should show the sidebar on /examples/crud', async ({ page }) => {
		await page.goto('/examples/crud');

		// Check that the sidebar is visible
		const sidebar = page.getByTestId('app-sidebar');
		await expect(sidebar).toBeVisible();

		// expand the examples
		await sidebar.getByText('Platform').waitFor();
		await sidebar.getByRole('button', { name: 'Examples' }).click();
		await page.waitForTimeout(500); // Wait for animation

		// Check that the sidebar has the correct links
		const examplesContent = sidebar.getByTestId('content-examples');
		const crudLink = examplesContent.locator('a[href="/examples/crud"]');
		await expect(crudLink).toBeVisible();

		const toastLink = examplesContent.locator('a[href="/examples/toast"]');
		await expect(toastLink).toBeVisible();

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

		// expand the examples
		await sidebar.getByText('Platform').waitFor();
		await sidebar.getByRole('button', { name: 'Examples' }).click();
		await page.waitForTimeout(500); // Wait for animation

		// Check that the active link is highlighted
		const examplesContent = sidebar.getByTestId('content-examples');
		const crudLink = examplesContent.locator('a[href="/examples/crud"]');
		await expect(crudLink).not.toHaveAttribute('data-active', 'true');

		const toastLink = examplesContent.locator('a[href="/examples/toast"]');
		await expect(toastLink).toHaveAttribute('data-active', 'true');
	});

	test('should navigate between example pages and update active state', async ({ page }) => {
		await page.goto('/examples/crud');

		const sidebar = page.getByTestId('app-sidebar');

		// expand the examples
		await sidebar.getByText('Platform').waitFor();
		await sidebar.getByRole('button', { name: 'Examples' }).click();
		await page.waitForTimeout(500); // Wait for animation

		const examplesContent = sidebar.getByTestId('content-examples');
		const toastLink = examplesContent.locator('a[href="/examples/toast"]');
		await toastLink.click();

		await expect(page).toHaveURL('/examples/toast');

		const crudLink = examplesContent.locator('a[href="/examples/crud"]');
		await expect(crudLink).not.toHaveAttribute('data-active', 'true');
		await expect(toastLink).toHaveAttribute('data-active', 'true');
	});
});
