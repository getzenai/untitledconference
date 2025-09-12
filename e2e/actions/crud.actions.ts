import { Page, expect } from '@playwright/test';
import { CrudPage } from '../pages/crud.page';

export interface ExampleObject {
	id?: string;
	name: string;
	description: string;
}

export class CrudActions {
	private page: Page;
	private crudPage: CrudPage;

	constructor(page: Page) {
		this.page = page;
		this.crudPage = new CrudPage(page);
	}

	async navigateToCrudPage(): Promise<void> {
		await this.crudPage.goto();
		await this.crudPage.waitForPageLoad();
	}

	async createExampleObject(name: string, description: string): Promise<void> {
		// Validate inputs - fail fast and loud
		if (!name || !description) {
			throw new Error(
				`createExampleObject requires both fields: name="${name}", description="${description}"`
			);
		}

		await this.crudPage.createItem(name, description);
		await this.verifyObjectExists(name);
	}

	async createMultipleObjects(objects: ExampleObject[]): Promise<void> {
		for (const obj of objects) {
			await this.crudPage.createItem(obj.name, obj.description);
		}
	}

	// Simple wrapper - just calls updateObjectByName
	async updateExampleObject(
		currentName: string,
		newName: string,
		newDescription: string
	): Promise<void> {
		await this.updateObjectByName(currentName, newName, newDescription);
	}

	async updateObjectByName(
		currentName: string,
		newName: string,
		newDescription: string
	): Promise<void> {
		// Validate inputs - fail fast and loud
		if (!currentName || !newName || !newDescription) {
			throw new Error(
				`updateObjectByName requires all fields: currentName="${currentName}", newName="${newName}", newDescription="${newDescription}"`
			);
		}

		// Find the item and click the View/Edit button
		const item = await this.crudPage.getItemByName(currentName);
		const editButton = item.locator('a:has-text("View/Edit")');
		await editButton.click();

		// Wait for navigation to detail page
		await this.page.waitForLoadState('networkidle');

		// Update BOTH fields - no conditionals, using Playwright UI recommended locators
		const nameInput = this.page.getByRole('textbox', { name: 'Name' });
		await nameInput.click(); // Focus the field first
		await nameInput.fill(''); // Clear by filling with empty string
		await nameInput.fill(newName);

		// Verify the name was actually entered
		await expect(nameInput).toHaveValue(newName);

		const descInput = this.page.getByRole('textbox', { name: 'Description' });
		await descInput.click(); // Focus the field first
		await descInput.fill(''); // Clear by filling with empty string
		await descInput.fill(newDescription);

		// Verify the description was actually entered
		await expect(descInput).toHaveValue(newDescription);

		// Submit the update
		const updateButton = this.page.getByRole('button', { name: 'Save Changes' });
		await updateButton.click();

		// Wait for the update to complete (button might show loading state)
		await this.page.waitForLoadState('networkidle', { timeout: 5000 });

		// Check if we need to navigate back to the list page
		const currentUrl = this.page.url();
		if (!currentUrl.endsWith('/examples/crud')) {
			// If we're still on the detail page, navigate back
			await this.page.goto('/examples/crud');
			await this.page.waitForLoadState('networkidle', { timeout: 5000 });
		}

		// Wait for the updated item to appear in the list
		await this.page.getByTestId('example-name').filter({ hasText: newName }).waitFor({
			state: 'visible'
		});
	}

	async deleteExampleObject(id: string): Promise<void> {
		await this.crudPage.deleteItem(id);
	}

	async deleteObjectByName(name: string): Promise<void> {
		// Find the item and click the View/Edit button
		const item = await this.crudPage.getItemByName(name);
		const editButton = item.locator('a:has-text("View/Edit")');
		await editButton.click();

		// Wait for navigation to detail page
		await this.page.waitForLoadState('networkidle');

		// Click the Delete button
		await this.page.getByRole('button', { name: /Delete/i }).click();

		// Confirm the deletion in the dialog
		await this.page.getByRole('button', { name: /Yes, delete it/i }).click();

		// Wait for deletion and redirect back to list
		await this.page.waitForLoadState('networkidle');
	}

	async deleteAllObjects(): Promise<void> {
		const count = await this.crudPage.getItemCount();
		for (let i = 0; i < count; i++) {
			// Always click the first item's edit button since items are removed after deletion
			const items = this.page.locator('div.grid > div');
			const firstItem = items.first();
			const editButton = firstItem.locator('a:has-text("View/Edit")');

			await editButton.click();

			// Delete the item
			await this.page.getByRole('button', { name: /Delete/i }).click();
			await this.page.getByRole('button', { name: /Yes, delete it/i }).click();
		}
	}

	async verifyObjectExists(name: string): Promise<void> {
		const exists = await this.crudPage.isItemVisible(name);
		expect(exists, `Object with name "${name}" should exist`).toBeTruthy();
	}

	async verifyObjectNotExists(name: string): Promise<void> {
		const exists = await this.crudPage.isItemVisible(name);
		expect(exists, `Object with name "${name}" should not exist`).toBeFalsy();
	}

	async searchForObject(query: string): Promise<void> {
		await this.crudPage.searchItems(query);
	}

	async clearSearch(): Promise<void> {
		await this.crudPage.clearSearch();
	}

	async getObjectCount(): Promise<number> {
		return await this.crudPage.getItemCount();
	}

	async verifyObjectCount(expectedCount: number): Promise<void> {
		const count = await this.getObjectCount();
		expect(count, `Expected ${expectedCount} objects, but found ${count}`).toBe(expectedCount);
	}

	async createObjectWithValidation(
		name: string,
		description: string,
		shouldSucceed = true
	): Promise<void> {
		await this.crudPage.createItem(name, description);

		if (shouldSucceed) {
			await this.verifyObjectExists(name);
			const error = await this.crudPage.getErrorText();
			expect(error).toBeNull();
		} else {
			const error = await this.crudPage.getErrorText();
			expect(error).not.toBeNull();
		}
	}

	async attemptCreateWithEmptyFields(): Promise<string | null> {
		await this.crudPage.submitEmptyForm();
		return await this.crudPage.getErrorText();
	}

	async attemptCreateWithEmptyName(description: string): Promise<string | null> {
		// Navigate to crud page first
		await this.crudPage.goto();
		await this.crudPage.waitForPageLoad();
		// Clear form and fill only description
		const descInput = this.page.getByRole('textbox', { name: 'Description' });
		const nameInput = this.page.getByRole('textbox', { name: 'Name' });
		await nameInput.clear();
		await descInput.clear();
		await descInput.fill(description);
		// Submit with empty name
		await this.page.getByRole('button', { name: 'Create Object' }).click();
		// Wait for form submission and error to appear
		await this.page.waitForLoadState('networkidle');
		return await this.crudPage.getErrorText();
	}

	async attemptCreateWithEmptyDescription(name: string): Promise<string | null> {
		// Navigate to crud page first
		await this.crudPage.goto();
		await this.crudPage.waitForPageLoad();
		// Clear form and fill only name
		const nameInput = this.page.getByRole('textbox', { name: 'Name' });
		const descInput = this.page.getByRole('textbox', { name: 'Description' });
		await nameInput.clear();
		await descInput.clear();
		await nameInput.fill(name);
		// Submit with empty description
		await this.page.getByRole('button', { name: 'Create Object' }).click();
		// Wait for form submission to complete
		await this.page.waitForLoadState('networkidle');
		return await this.crudPage.getErrorText();
	}

	async createUniqueObject(baseName: string, baseDescription: string): Promise<ExampleObject> {
		const timestamp = Date.now();
		const uniqueName = `${baseName} ${timestamp}`;
		const uniqueDescription = `${baseDescription} (Created at ${timestamp})`;

		await this.createExampleObject(uniqueName, uniqueDescription);

		return {
			name: uniqueName,
			description: uniqueDescription
		};
	}

	async waitForEmptyState(): Promise<void> {
		await expect(this.page.locator('.empty-state, [data-testid="empty-state"]')).toBeVisible({
			timeout: 5000
		});
	}

	async isFormEmpty(): Promise<boolean> {
		return await this.crudPage.isFormEmpty();
	}

	async validateFormCleared(): Promise<void> {
		const isEmpty = await this.isFormEmpty();
		expect(isEmpty, 'Form should be cleared after successful submission').toBeTruthy();
	}

	async getObjectDetails(name: string): Promise<ExampleObject | null> {
		const item = await this.crudPage.getItemByName(name);
		if (!(await item.isVisible())) {
			return null;
		}

		const nameText = await item.getByTestId('example-name').textContent();
		// Description is not shown in the list view, only on the detail page
		// We'll return empty string for description since it's not available here
		const idText = await item.locator('p:has-text("ID:")').textContent();
		const id = idText ? idText.replace('ID: ', '') : undefined;

		return {
			id: id,
			name: nameText || '',
			description: '' // Description not available in list view
		};
	}

	// Alias for getObjectDetails to match the test expectation
	async findExampleObjectByName(name: string): Promise<ExampleObject | null> {
		return await this.getObjectDetails(name);
	}

	// Verify object details by navigating to the detail page
	async verifyObjectDetailsOnDetailPage(
		name: string,
		expectedDescription?: string
	): Promise<boolean> {
		try {
			// Find and click the View/Edit button for the item
			const item = await this.crudPage.getItemByName(name);
			if (!(await item.isVisible())) {
				console.log(`Item "${name}" not found on page`);
				return false;
			}

			const editButton = item.locator('a:has-text("View/Edit")');
			await editButton.click();

			// Wait for navigation to detail page and form to be ready
			await this.page.waitForLoadState('networkidle');

			// Wait for the form inputs to be visible
			await this.page.getByRole('textbox', { name: 'Name' }).waitFor({ state: 'visible' });

			// Verify the name is displayed
			const nameInput = this.page.getByRole('textbox', { name: 'Name' });
			const nameValue = await nameInput.inputValue();
			console.log(`Name in form: "${nameValue}", expected: "${name}"`);

			// Verify description if provided
			if (expectedDescription) {
				const descInput = this.page.getByRole('textbox', { name: 'Description' });
				const descValue = await descInput.inputValue();
				console.log(`Description in form: "${descValue}", expected: "${expectedDescription}"`);
				const matches = nameValue === name && descValue === expectedDescription;

				// Navigate back to list
				await this.page.goto('/examples/crud');
				await this.page.waitForLoadState('networkidle');

				return matches;
			}

			// Navigate back to list
			await this.page.goto('/examples/crud');
			await this.page.waitForLoadState('networkidle');

			return nameValue === name;
		} catch (error) {
			console.error('Error verifying object details:', error);
			// Try to navigate back to list page on error
			await this.page.goto('/examples/crud').catch(() => {});
			return false;
		}
	}

	async bulkCreate(count: number, basePrefix: string): Promise<ExampleObject[]> {
		const objects: ExampleObject[] = [];

		for (let i = 1; i <= count; i++) {
			const obj = {
				name: `${basePrefix} Item ${i}`,
				description: `Description for ${basePrefix} item number ${i}`
			};
			objects.push(obj);
			await this.createExampleObject(obj.name, obj.description);
		}

		return objects;
	}
}
