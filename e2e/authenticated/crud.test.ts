import { expect, test } from '@playwright/test';

test.describe('Example Object CRUD Operations', () => {
	const exampleNameBase = 'E2E Test Example';
	const exampleDescriptionBase = 'This is an example object created by an E2E test.';

	test.beforeEach(async ({ page }) => {
		await page.goto('/examples/crud');
	});

	test.describe('Create Operation', () => {
		test('Happy Path: should create a new example object successfully', async ({ page }) => {
			const uniqueExampleName = `${exampleNameBase} Create Success ${Date.now()}`;
			await page.getByLabel('Name').fill(uniqueExampleName);
			await page.getByLabel('Description').fill(`${exampleDescriptionBase} (Create Success)`);
			await page.getByRole('button', { name: 'Create Object' }).click();
			// Wait for the submitting state to resolve by checking the button text changes back
			await expect(page.getByRole('button', { name: 'Create Object' })).toBeVisible();
			// Wait for form fields to clear as an indication of client-side success handling
			await expect(page.getByLabel('Name')).toBeEmpty();
			await expect(page.getByLabel('Description')).toBeEmpty();
			await page.waitForLoadState('networkidle'); // Wait for network to be idle after invalidateAll

			// Debug: Check URL
			// Debug: Check URL
			expect(
				page.url(),
				'Should still be on the /examples/crud page after creation attempt'
			).toContain('/examples/crud');

			// Assert based on UI change (element appearing)
			const newExampleCard = page.locator(
				`div.grid > div:has([data-testid="example-name"]:has-text("${uniqueExampleName}"))`
			);
			await expect(
				newExampleCard,
				`Card with text "${uniqueExampleName}" should be visible after creation.`
			).toBeVisible();
		}); // Closes 'Happy Path: should create a new example object successfully'

		test('Outlier: should show validation error if name is empty', async ({ page }) => {
			await page.getByRole('button', { name: 'Create Object' }).click();
			await expect(page.getByText('Name is required.')).toBeVisible();
		}); // Closes 'Outlier: should show validation error if name is empty'
	}); // Closes 'Create Operation'

	test.describe('Read, Update, Delete Operations', () => {
		// Helper function to create an example and return its ID and name
		async function createExampleObject(page: import('@playwright/test').Page, nameSuffix: string) {
			const uniqueName = `${exampleNameBase} ${nameSuffix} ${Date.now()}`;
			const description = `${exampleDescriptionBase} (${nameSuffix})`;
			await page.goto('/examples/crud'); // Ensure on correct page
			await page.getByLabel('Name').fill(uniqueName);
			await page.getByLabel('Description').fill(description);
			await page.getByRole('button', { name: 'Create Object' }).click();
			// Wait for the submitting state to resolve by checking the button text changes back
			await expect(page.getByRole('button', { name: 'Create Object' })).toBeVisible();
			// Wait for form fields to clear
			await expect(page.getByLabel('Name')).toBeEmpty();
			await expect(page.getByLabel('Description')).toBeEmpty();
			await page.waitForLoadState('networkidle'); // Wait for network to be idle after invalidateAll
			// Ensure creation is complete by checking for the card

			// Debug: Check URL
			expect(
				page.url(),
				'Helper: Should still be on the /examples/crud page after creation attempt'
			).toContain('/examples/crud');

			const newExampleCard = page.locator(
				`div.grid > div:has([data-testid="example-name"]:has-text("${uniqueName}"))`
			);
			await expect(
				newExampleCard,
				`Helper: Card with text "${uniqueName}" should be visible after creation.`
			).toBeVisible();
			// To get the ID, we still need the link from within this card
			const viewEditLink = newExampleCard.getByRole('link', { name: 'View/Edit' });
			const href = await viewEditLink.getAttribute('href');
			expect(href, 'View/Edit link must have an href for the created card.').toBeTruthy();
			const idMatch = href?.match(/\/examples\/crud\/(\d+)/);
			expect(idMatch, 'Href for the created card should contain a numeric ID.').toBeTruthy();
			if (!idMatch) {
				throw new Error('Could not extract ID from href');
			}
			return { id: idMatch[1], name: uniqueName, description };
		}

		test('Read Detail: Happy Path - should display example details on its page', async ({
			page
		}) => {
			const { id, name, description } = await createExampleObject(page, 'ForRead');
			await page.goto(`/examples/crud/${id}`);

			await expect(page).toHaveURL(`/examples/crud/${id}`);
			await expect(page.locator('input[name="name"]')).toHaveValue(name);
			await expect(page.locator('textarea[name="description"]')).toHaveValue(description);
		}); // Closes 'Read Detail: Happy Path'

		test('Update: Happy Path - should update an existing example object', async ({ page }) => {
			const { id, name: originalName } = await createExampleObject(page, 'ForUpdate');
			await page.goto(`/examples/crud/${id}`);

			const updatedName = `${originalName} - Updated`;
			const updatedDescription = `${exampleDescriptionBase} (Updated)`;

			await page.locator('input[name="name"]').fill(updatedName);
			await page.locator('textarea[name="description"]').fill(updatedDescription);
			await page.getByRole('button', { name: 'Save Changes' }).click();
			await page.waitForLoadState('networkidle'); // Wait for action and potential reload on detail page

			// Assert based on UI change (input values updated)
			await expect(page.locator('input[name="name"]')).toHaveValue(updatedName);
			await expect(page.locator('textarea[name="description"]')).toHaveValue(updatedDescription);

			await page.goto('/examples/crud');
			await page.waitForLoadState('networkidle'); // Wait for list to reload
			await expect(page.getByText(updatedName)).toBeVisible();
		}); // Closes 'Update: Happy Path'

		test('Update: Outlier - should show validation error if name is empty on update', async ({
			page
		}) => {
			const { id } = await createExampleObject(page, 'ForUpdateFail');
			await page.goto(`/examples/crud/${id}`);

			await page.locator('input[name="name"]').fill('');
			await page
				.locator('textarea[name="description"]')
				.fill(`${exampleDescriptionBase} (Update Name Empty)`);
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
			const { id, name } = await createExampleObject(page, 'ForDeleteCancel');
			await page.goto(`/examples/crud/${id}`);

			await page.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByText('Are you absolutely sure?')).toBeVisible();
			await page.getByRole('button', { name: 'Cancel' }).click();

			await expect(page.getByText('Are you absolutely sure?')).not.toBeVisible();
			await expect(page.locator('input[name="name"]')).toHaveValue(name);

			await page.goto('/examples/crud'); // Navigate back to check
			await expect(
				page.locator(`div.grid > div:has([data-testid="example-name"]:has-text("${name}"))`)
			).toBeVisible();
		}); // Closes 'Delete: Outlier'

		test('Delete: Happy Path - should delete an existing example object', async ({ page }) => {
			const { id, name } = await createExampleObject(page, 'ForDeleteSuccess');
			await page.goto(`/examples/crud/${id}`);

			await page.getByRole('button', { name: 'Delete' }).click();
			await expect(page.getByText('Are you absolutely sure?')).toBeVisible();
			await page.getByRole('button', { name: 'Yes, delete it' }).click();

			await expect(page).toHaveURL('/examples/crud');
			await page.waitForLoadState('networkidle'); // Wait for list to reload after redirect
			await expect(page.getByText(name)).not.toBeVisible();
		}); // Closes 'Delete: Happy Path'
	}); // Closes 'Read, Update, Delete Operations'
}); // Closes 'Example Object CRUD Operations'
