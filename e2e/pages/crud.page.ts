import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class CrudPage extends BasePage {
	readonly path = '/examples/crud';

	private readonly nameInput: Locator;
	private readonly descriptionInput: Locator;
	private readonly createButton: Locator;
	private readonly updateButton: Locator;
	private readonly deleteButton: Locator;
	private readonly cancelButton: Locator;
	private readonly searchInput: Locator;
	private readonly itemGrid: Locator;
	private readonly errorMessage: Locator;
	private readonly successMessage: Locator;
	private readonly loadingSpinner: Locator;
	private readonly emptyState: Locator;

	constructor(page: Page) {
		super(page);
		this.nameInput = page.getByRole('textbox', { name: 'Name' });
		this.descriptionInput = page.getByRole('textbox', { name: 'Description' });
		this.createButton = page.getByRole('button', { name: 'Create Object' });
		this.updateButton = page.getByRole('button', { name: /update/i });
		this.deleteButton = page.getByRole('button', { name: /delete/i });
		this.cancelButton = page.getByRole('button', { name: /cancel/i });
		this.searchInput = page.getByPlaceholder(/search/i);
		this.itemGrid = page.locator('div.grid');
		// Updated to match the actual error message elements in the CRUD form
		this.errorMessage = page.locator('.text-destructive, [role="alert"], .error-message').first();
		this.successMessage = page.locator('.success-message, [role="status"]').first();
		this.loadingSpinner = page.locator('.loading, .spinner, [role="progressbar"]');
		this.emptyState = page.locator('.empty-state, [data-testid="empty-state"]');
	}

	async createItem(name: string, description: string): Promise<void> {
		await this.nameInput.fill(name);
		await this.descriptionInput.fill(description);
		await this.createButton.click();

		// Wait for button to show "Creating..." and then return to "Create Object" (max 2 seconds)
		await this.page.waitForFunction(() => {
			const buttons = Array.from(document.querySelectorAll('button'));
			const createButton = buttons.find((btn) => btn.textContent?.includes('Create Object'));
			// Button should be back to "Create Object" text (not "Creating...")
			return createButton !== undefined && createButton !== null;
		}, {});

		// Wait for the new item to appear in the list using test-id (max 2 seconds)
		await this.page.getByTestId('example-name').filter({ hasText: name }).waitFor({
			state: 'visible'
		});

		// Form should be cleared after successful submission
		await this.waitForFormSubmission();
	}

	async updateItem(itemId: string, name: string, description: string): Promise<void> {
		await this.selectItem(itemId);
		await this.nameInput.clear();
		await this.descriptionInput.clear();
		await this.nameInput.fill(name);
		await this.descriptionInput.fill(description);
		await this.updateButton.click();
		await this.waitForFormSubmission();
	}

	async deleteItem(itemId: string): Promise<void> {
		await this.selectItem(itemId);
		await this.deleteButton.click();
		const confirmButton = this.page.getByRole('button', { name: /confirm/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}
		await this.waitForItemDeletion(itemId);
	}

	async searchItems(query: string): Promise<void> {
		await this.searchInput.fill(query);
	}

	async clearSearch(): Promise<void> {
		await this.searchInput.clear();
	}

	async selectItem(itemId: string): Promise<void> {
		const item = this.getItemLocator(itemId);
		await this.scrollToElement(item);
		await item.click();
	}

	private getItemLocator(itemId: string): Locator {
		return this.page.locator(
			`[data-testid="item-${itemId}"], [data-id="${itemId}"], #item-${itemId}`
		);
	}

	async getItemByName(name: string): Promise<Locator> {
		// Find the grid item (card) that contains the specific name
		// Using filter is more reliable than traversing up with ..
		return this.itemGrid
			.locator('> div')
			.filter({ has: this.page.getByTestId('example-name').getByText(name, { exact: true }) })
			.first();
	}

	async isItemVisible(name: string): Promise<boolean> {
		// Check if the specific name exists in any example-name element
		// Using count() > 0 is more reliable than isVisible() for checking existence
		const count = await this.page
			.getByTestId('example-name')
			.getByText(name, { exact: true })
			.count();
		return count > 0;
	}

	async getItemCount(): Promise<number> {
		await this.waitForPageLoad();
		const items = this.itemGrid.locator('> div');
		return await items.count();
	}

	async isFormEmpty(): Promise<boolean> {
		const nameValue = await this.nameInput.inputValue();
		const descValue = await this.descriptionInput.inputValue();
		return nameValue === '' && descValue === '';
	}

	async isCreateButtonVisible(): Promise<boolean> {
		return await this.createButton.isVisible();
	}

	async isUpdateButtonVisible(): Promise<boolean> {
		return await this.updateButton.isVisible();
	}

	async isDeleteButtonVisible(): Promise<boolean> {
		return await this.deleteButton.isVisible();
	}

	async waitForFormSubmission(): Promise<void> {
		await this.page.waitForLoadState('networkidle');
		await expect(this.nameInput).toBeEmpty();
		await expect(this.descriptionInput).toBeEmpty();
	}

	async waitForItemDeletion(itemId: string): Promise<void> {
		const item = this.getItemLocator(itemId);
		await this.waitForElementHidden(item);
		await this.page.waitForLoadState('networkidle');
	}

	async isErrorVisible(): Promise<boolean> {
		try {
			// Wait a bit for error to appear after form submission
			await this.errorMessage.waitFor({ state: 'visible' });
			return true;
		} catch {
			return false;
		}
	}

	async getErrorText(): Promise<string | null> {
		if (await this.isErrorVisible()) {
			return await this.errorMessage.textContent();
		}
		return null;
	}

	async isSuccessVisible(): Promise<boolean> {
		return await this.successMessage.isVisible();
	}

	async getSuccessText(): Promise<string | null> {
		if (await this.isSuccessVisible()) {
			return await this.successMessage.textContent();
		}
		return null;
	}

	async isLoadingVisible(): Promise<boolean> {
		return await this.loadingSpinner.isVisible();
	}

	async waitForLoadingComplete(): Promise<void> {
		await this.waitForElementHidden(this.loadingSpinner);
	}

	async isEmptyStateVisible(): Promise<boolean> {
		return await this.emptyState.isVisible();
	}

	async validateFormFields(name: string, description: string): Promise<boolean> {
		const nameValue = await this.nameInput.inputValue();
		const descValue = await this.descriptionInput.inputValue();
		return nameValue === name && descValue === description;
	}

	async submitEmptyForm(): Promise<void> {
		await this.nameInput.clear();
		await this.descriptionInput.clear();
		await this.createButton.click();
		// Wait for form submission and error to appear
		await this.page.waitForLoadState('networkidle');
	}
}
