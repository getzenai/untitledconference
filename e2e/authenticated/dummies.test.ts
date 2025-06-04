import { expect, test } from '@playwright/test';

test.describe('Dummies CRUD Operations', () => {
	const dummyNameBase = 'E2E Test Dummy';
	const dummyDescriptionBase = 'This is a dummy element created by an E2E test.';

	test.beforeEach(async ({ page }) => {
		await page.goto('/dummies');
	});

	test.describe('Create Operation', () => {
		test('Happy Path: should create a new dummy element successfully', async ({ page }) => {
			const uniqueDummyName = `${dummyNameBase} Create Success ${Date.now()}`;
			await page.getByLabel('Name').fill(uniqueDummyName);
			await page.getByLabel('Description').fill(`${dummyDescriptionBase} (Create Success)`);
			await page.getByRole('button', { name: 'Create Element' }).click();
			// Wait for the submitting state to resolve by checking the button text changes back
			await expect(page.getByRole('button', { name: 'Create Element' })).toBeVisible();
			// Wait for form fields to clear as an indication of client-side success handling
			await expect(page.getByLabel('Name')).toBeEmpty();
			await expect(page.getByLabel('Description')).toBeEmpty();
			await page.waitForLoadState('networkidle'); // Wait for network to be idle after invalidateAll

			// Debug: Check URL
			// Debug: Check URL
			expect(page.url(), 'Should still be on the /dummies page after creation attempt').toContain(
				'/dummies'
			);

			// Assert based on UI change (element appearing)
			const newDummyCard = page.locator(`div.grid > div:has(h3:has-text("${uniqueDummyName}"))`);
			await expect(
				newDummyCard,
				`Card with text "${uniqueDummyName}" should be visible after creation.`
			).toBeVisible();
		}); // Closes 'Happy Path: should create a new dummy element successfully'

		test('Outlier: should show validation error if name is empty', async ({ page }) => {
			await page.getByRole('button', { name: 'Create Element' }).click();
			await expect(page.getByText('Name is required.')).toBeVisible();
		}); // Closes 'Outlier: should show validation error if name is empty'
	}); // Closes 'Create Operation'

	test.describe('Read, Update, Delete Operations', () => {
		// Helper function to create a dummy and return its ID and name
		async function createDummyElement(page: import('@playwright/test').Page, nameSuffix: string) {
			const uniqueName = `${dummyNameBase} ${nameSuffix} ${Date.now()}`;
			const description = `${dummyDescriptionBase} (${nameSuffix})`;
			await page.goto('/dummies'); // Ensure on correct page
			await page.getByLabel('Name').fill(uniqueName);
			await page.getByLabel('Description').fill(description);
			await page.getByRole('button', { name: 'Create Element' }).click();
			// Wait for the submitting state to resolve by checking the button text changes back
			await expect(page.getByRole('button', { name: 'Create Element' })).toBeVisible();
			// Wait for form fields to clear
			await expect(page.getByLabel('Name')).toBeEmpty();
			await expect(page.getByLabel('Description')).toBeEmpty();
			await page.waitForLoadState('networkidle'); // Wait for network to be idle after invalidateAll
			// Ensure creation is complete by checking for the card

			// Debug: Check URL
			expect(
				page.url(),
				'Helper: Should still be on the /dummies page after creation attempt'
			).toContain('/dummies');

			const newDummyCard = page.locator(`div.grid > div:has(h3:has-text("${uniqueName}"))`);
			await expect(
				newDummyCard,
				`Helper: Card with text "${uniqueName}" should be visible after creation.`
			).toBeVisible();
			// To get the ID, we still need the link from within this card
			const viewEditLink = newDummyCard.getByRole('link', { name: 'View/Edit' });
			const href = await viewEditLink.getAttribute('href');
			expect(href, 'View/Edit link must have an href for the created card.').toBeTruthy();
			const idMatch = href!.match(/\/dummies\/(\d+)/);
			expect(idMatch, 'Href for the created card should contain a numeric ID.').toBeTruthy();
			return { id: idMatch![1], name: uniqueName, description };
		}

		test('Read Detail: Happy Path - should display dummy details on its page', async ({ page }) => {
			const { id, name, description } = await createDummyElement(page, 'ForRead');
			await page.goto(`/dummies/${id}`);

			await expect(page).toHaveURL(`/dummies/${id}`);
			await expect(page.locator('input[name="name"]')).toHaveValue(name);
			await expect(page.locator('textarea[name="description"]')).toHaveValue(description);
		}); // Closes 'Read Detail: Happy Path'

		test('Update: Happy Path - should update an existing dummy element', async ({ page }) => {
			const { id, name: originalName } = await createDummyElement(page, 'ForUpdate');
			await page.goto(`/dummies/${id}`);

			const updatedName = `${originalName} - Updated`;
			const updatedDescription = `${dummyDescriptionBase} (Updated)`;

			await page.locator('input[name="name"]').fill(updatedName);
			await page.locator('textarea[name="description"]').fill(updatedDescription);
			await page.getByRole('button', { name: 'Save Changes' }).click();
			await page.waitForLoadState('networkidle'); // Wait for action and potential reload on detail page

			// Assert based on UI change (input values updated)
			await expect(page.locator('input[name="name"]')).toHaveValue(updatedName);
			await expect(page.locator('textarea[name="description"]')).toHaveValue(updatedDescription);

			await page.goto('/dummies');
			await page.waitForLoadState('networkidle'); // Wait for list to reload
			await expect(page.getByText(updatedName)).toBeVisible();
		}); // Closes 'Update: Happy Path'

		test('Update: Outlier - should show validation error if name is empty on update', async ({
			page
		}) => {
			const { id } = await createDummyElement(page, 'ForUpdateFail');
			await page.goto(`/dummies/${id}`);

			await page.locator('input[name="name"]').fill('');
			await page
				.locator('textarea[name="description"]')
				.fill(`${dummyDescriptionBase} (Update Name Empty)`);
			await page.getByRole('button', { name: 'Save Changes' }).click();
			// Wait for the submission to finish (button re-enables)
			await expect(
				page.getByRole('button', { name: 'Save Changes' }),
				'Save Changes button should be enabled after submission attempt.'
			).toBeEnabled();

			await expect(
				page.getByText('Name is required.', { exact: true }),
				"Validation error 'Name is required.' should be visible."
			).toBeVisible();
		}); // Closes 'Update: Outlier'

		test('Delete: Outlier - should cancel deletion when "Cancel" is clicked', async ({ page }) => {
			const { id, name } = await createDummyElement(page, 'ForDeleteCancel');
			await page.goto(`/dummies/${id}`);

			await page.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByText('Are you absolutely sure?')).toBeVisible();
			await page.getByRole('button', { name: 'Cancel' }).click();

			await expect(page.getByText('Are you absolutely sure?')).not.toBeVisible();
			await expect(page.locator('input[name="name"]')).toHaveValue(name);

			await page.goto('/dummies'); // Navigate back to check
			await expect(page.locator(`div.grid > div:has(h3:has-text("${name}"))`)).toBeVisible();
		}); // Closes 'Delete: Outlier'

		test('Delete: Happy Path - should delete an existing dummy element', async ({ page }) => {
			const { id, name } = await createDummyElement(page, 'ForDeleteSuccess');
			await page.goto(`/dummies/${id}`);

			await page.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByText('Are you absolutely sure?')).toBeVisible();
			await page.getByRole('button', { name: 'Yes, delete it' }).click();

			await expect(page).toHaveURL('/dummies');
			await page.waitForLoadState('networkidle'); // Wait for list to reload after redirect
			await expect(page.getByText(name)).not.toBeVisible();
		}); // Closes 'Delete: Happy Path'
	}); // Closes 'Read, Update, Delete Operations'
}); // Closes 'Dummies CRUD Operations'
