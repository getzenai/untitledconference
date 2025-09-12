import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class UIComponentsPage extends BasePage {
	readonly path = '/examples/ui-components';

	// Form controls
	readonly textInput: Locator;
	readonly emailInput: Locator;
	readonly passwordInput: Locator;
	readonly numberInput: Locator;
	readonly textarea: Locator;
	readonly singleCheckbox: Locator;
	readonly checkboxOption1: Locator;
	readonly checkboxOption2: Locator;
	readonly checkboxOption3: Locator;
	readonly radioOption1: Locator;
	readonly radioOption2: Locator;
	readonly radioOption3: Locator;
	readonly switch: Locator;
	readonly selectTrigger: Locator;
	readonly submitButton: Locator;
	readonly dataTable: Locator;

	// Buttons
	readonly buttonDefault: Locator;
	readonly buttonSecondary: Locator;
	readonly buttonDestructive: Locator;
	readonly buttonOutline: Locator;
	readonly buttonGhost: Locator;
	readonly buttonLink: Locator;
	readonly buttonLoading: Locator;
	readonly buttonDisabled: Locator;

	// Feedback components
	readonly alertDefault: Locator;
	readonly alertDestructive: Locator;
	readonly badgeDefault: Locator;
	readonly badgeSecondary: Locator;
	readonly badgeDestructive: Locator;
	readonly badgeOutline: Locator;
	readonly progressBar: Locator;
	readonly progressDecrease: Locator;
	readonly progressIncrease: Locator;
	readonly toastSuccess: Locator;
	readonly toastError: Locator;
	readonly toastInfo: Locator;
	readonly toastWarning: Locator;

	// Overlays
	readonly dialogTrigger: Locator;
	readonly dialogContent: Locator;
	readonly dialogInput: Locator;
	readonly dialogCancel: Locator;
	readonly dialogConfirm: Locator;
	readonly alertDialogTrigger: Locator;
	readonly alertDialogContent: Locator;
	readonly alertDialogCancel: Locator;
	readonly alertDialogConfirm: Locator;

	// Layout components
	readonly accordionTrigger1: Locator;
	readonly accordionTrigger2: Locator;
	readonly accordionTrigger3: Locator;
	readonly accordionContent1: Locator;
	readonly accordionContent2: Locator;
	readonly accordionContent3: Locator;
	readonly tabTrigger1: Locator;
	readonly tabTrigger2: Locator;
	readonly tabTrigger3: Locator;
	readonly tabContent1: Locator;
	readonly tabContent2: Locator;
	readonly tabContent3: Locator;

	constructor(page: Page) {
		super(page);

		// Form controls
		this.textInput = page.getByTestId('text-input');
		this.emailInput = page.getByTestId('email-input');
		this.passwordInput = page.getByTestId('password-input');
		this.numberInput = page.getByTestId('number-input');
		this.textarea = page.getByTestId('textarea');
		this.singleCheckbox = page.getByTestId('single-checkbox');
		this.checkboxOption1 = page.getByTestId('checkbox-option1');
		this.checkboxOption2 = page.getByTestId('checkbox-option2');
		this.checkboxOption3 = page.getByTestId('checkbox-option3');
		this.radioOption1 = page.getByTestId('radio-option1');
		this.radioOption2 = page.getByTestId('radio-option2');
		this.radioOption3 = page.getByTestId('radio-option3');
		this.switch = page.getByTestId('switch');
		this.selectTrigger = page.getByTestId('select-trigger');
		this.submitButton = page.getByTestId('submit-button');
		this.dataTable = page.getByTestId('data-table');

		// Buttons
		this.buttonDefault = page.getByTestId('button-default');
		this.buttonSecondary = page.getByTestId('button-secondary');
		this.buttonDestructive = page.getByTestId('button-destructive');
		this.buttonOutline = page.getByTestId('button-outline');
		this.buttonGhost = page.getByTestId('button-ghost');
		this.buttonLink = page.getByTestId('button-link');
		this.buttonLoading = page.getByTestId('button-loading');
		this.buttonDisabled = page.getByTestId('button-disabled');

		// Feedback components
		this.alertDefault = page.getByTestId('alert-default');
		this.alertDestructive = page.getByTestId('alert-destructive');
		this.badgeDefault = page.getByTestId('badge-default');
		this.badgeSecondary = page.getByTestId('badge-secondary');
		this.badgeDestructive = page.getByTestId('badge-destructive');
		this.badgeOutline = page.getByTestId('badge-outline');
		this.progressBar = page.getByTestId('progress-bar');
		this.progressDecrease = page.getByTestId('progress-decrease');
		this.progressIncrease = page.getByTestId('progress-increase');
		this.toastSuccess = page.getByTestId('toast-success');
		this.toastError = page.getByTestId('toast-error');
		this.toastInfo = page.getByTestId('toast-info');
		this.toastWarning = page.getByTestId('toast-warning');

		// Overlays
		this.dialogTrigger = page.getByTestId('dialog-trigger');
		this.dialogContent = page.getByTestId('dialog-content');
		this.dialogInput = page.getByTestId('dialog-input');
		this.dialogCancel = page.getByTestId('dialog-cancel');
		this.dialogConfirm = page.getByTestId('dialog-confirm');
		this.alertDialogTrigger = page.getByTestId('alert-dialog-trigger');
		this.alertDialogContent = page.getByTestId('alert-dialog-content');
		this.alertDialogCancel = page.getByTestId('alert-dialog-cancel');
		this.alertDialogConfirm = page.getByTestId('alert-dialog-confirm');

		// Layout components
		this.accordionTrigger1 = page.getByTestId('accordion-trigger-1');
		this.accordionTrigger2 = page.getByTestId('accordion-trigger-2');
		this.accordionTrigger3 = page.getByTestId('accordion-trigger-3');
		this.accordionContent1 = page.getByTestId('accordion-content-1');
		this.accordionContent2 = page.getByTestId('accordion-content-2');
		this.accordionContent3 = page.getByTestId('accordion-content-3');
		this.tabTrigger1 = page.getByTestId('tab-trigger-1');
		this.tabTrigger2 = page.getByTestId('tab-trigger-2');
		this.tabTrigger3 = page.getByTestId('tab-trigger-3');
		this.tabContent1 = page.getByTestId('tab-content-1');
		this.tabContent2 = page.getByTestId('tab-content-2');
		this.tabContent3 = page.getByTestId('tab-content-3');
	}

	/**
	 * Get the current value of a form input
	 */
	async getInputValue(locator: Locator): Promise<string> {
		return await locator.inputValue();
	}

	/**
	 * Check if a checkbox or switch is checked
	 */
	async isChecked(locator: Locator): Promise<boolean> {
		return await locator.isChecked();
	}

	/**
	 * Get the selected value from the select dropdown
	 */
	async getSelectedValue(): Promise<string> {
		const text = await this.selectTrigger.textContent();
		return text || '';
	}

	/**
	 * Select an option from the dropdown
	 */
	async selectOption(value: string): Promise<void> {
		// Click to open the dropdown
		await this.selectTrigger.click();

		// Click the option
		await this.page.getByTestId(`select-${value}`).click();
	}

	/**
	 * Open dialog
	 */
	async openDialog(): Promise<void> {
		await this.dialogTrigger.click();
		await this.dialogContent.waitFor({ state: 'visible' });
	}

	/**
	 * Close dialog
	 */
	async closeDialog(confirm = false): Promise<void> {
		if (confirm) {
			await this.dialogConfirm.click();
		} else {
			await this.dialogCancel.click();
		}
		await this.dialogContent.waitFor({ state: 'hidden' });
	}

	/**
	 * Open alert dialog
	 */
	async openAlertDialog(): Promise<void> {
		await this.alertDialogTrigger.click();
		await this.alertDialogContent.waitFor({ state: 'visible' });
	}

	/**
	 * Close alert dialog
	 */
	async closeAlertDialog(confirm = false): Promise<void> {
		if (confirm) {
			await this.alertDialogConfirm.click();
		} else {
			await this.alertDialogCancel.click();
		}
	}

	/**
	 * Toggle accordion item
	 */
	async toggleAccordion(index: 1 | 2 | 3): Promise<void> {
		const trigger = this[`accordionTrigger${index}`];
		await trigger.click();
	}

	/**
	 * Check if accordion content is visible
	 */
	async isAccordionOpen(index: 1 | 2 | 3): Promise<boolean> {
		const trigger = this[`accordionTrigger${index}`];
		// Check if the trigger has aria-expanded attribute set to true
		const ariaExpanded = await trigger.getAttribute('aria-expanded');
		if (ariaExpanded === 'true') {
			return true;
		}
		// Fallback to checking content visibility
		const content = this[`accordionContent${index}`];
		return await content.isVisible();
	}

	/**
	 * Switch to a tab
	 */
	async switchToTab(index: 1 | 2 | 3): Promise<void> {
		const trigger = this[`tabTrigger${index}`];
		await trigger.click();
	}

	/**
	 * Check if tab content is visible
	 */
	async isTabActive(index: 1 | 2 | 3): Promise<boolean> {
		const trigger = this[`tabTrigger${index}`];
		// Check if the trigger has data-state="active" or aria-selected="true"
		const dataState = await trigger.getAttribute('data-state');
		if (dataState === 'active') {
			return true;
		}
		const ariaSelected = await trigger.getAttribute('aria-selected');
		if (ariaSelected === 'true') {
			return true;
		}
		// Fallback to checking content visibility
		const content = this[`tabContent${index}`];
		try {
			await content.waitFor({ state: 'visible', timeout: 1000 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get progress bar value
	 */
	async getProgressValue(): Promise<number> {
		const value = await this.progressBar.getAttribute('aria-valuenow');
		return value ? Number(value) : 0;
	}

	/**
	 * Update progress value
	 */
	async updateProgress(increase: boolean): Promise<void> {
		if (increase) {
			await this.progressIncrease.click();
		} else {
			await this.progressDecrease.click();
		}
	}

	/**
	 * Trigger a toast notification
	 */
	async triggerToast(type: 'success' | 'error' | 'info' | 'warning'): Promise<void> {
		const button = this[`toast${type.charAt(0).toUpperCase() + type.slice(1)}`];
		await button.click();
	}

	/**
	 * Wait for toast to appear
	 */
	async waitForToast(): Promise<void> {
		await this.page.locator('[data-sonner-toast]').first().waitFor({ state: 'visible' });
	}

	/**
	 * Wait for toast to disappear
	 */
	async waitForToastToDisappear(): Promise<void> {
		await this.page.locator('[data-sonner-toast]').first().waitFor({ state: 'hidden' });
	}

	/**
	 * Fill the form with test data
	 */
	async fillTestForm(): Promise<void> {
		await this.fillFieldWithClear(this.textInput, 'Test Text');
		await this.fillFieldWithClear(this.emailInput, 'test@example.com');
		await this.fillFieldWithClear(this.passwordInput, 'TestPassword123');
		await this.fillFieldWithClear(this.numberInput, '42');
		await this.fillFieldWithClear(this.textarea, 'This is a test description');
		await this.singleCheckbox.check();
		await this.checkboxOption1.check();
		await this.radioOption2.click();
		await this.switch.click();
		await this.selectOption('option2');
	}

	/**
	 * Submit the form
	 */
	async submitForm(): Promise<void> {
		await this.submitButton.click();
		await this.waitForToast();
	}

	/**
	 * Get value from table cell by finding row with specific column value
	 * @param searchColumn Column name to search in (ID, Name, Email, Status, Role)
	 * @param searchValue Value to search for in the column
	 * @param targetColumn Column name to extract value from
	 */
	async getTableCellValue(
		searchColumn: string,
		searchValue: string,
		targetColumn: string
	): Promise<string> {
		// Map column names to indices
		const columnMap: Record<string, number> = {
			ID: 0,
			Name: 1,
			Email: 2,
			Status: 3,
			Role: 4
		};

		const searchIndex = columnMap[searchColumn];
		const targetIndex = columnMap[targetColumn];

		// Find all rows
		const rows = await this.dataTable.locator('tbody tr').all();

		for (const row of rows) {
			const cells = await row.locator('td').all();
			if (cells.length > searchIndex) {
				const cellText = await cells[searchIndex].textContent();
				if (cellText?.trim() === searchValue) {
					return (await cells[targetIndex].textContent()) || '';
				}
			}
		}

		return '';
	}

	/**
	 * Get all rows that have a specific value in a column
	 */
	async getRowsByColumnValue(column: string, value: string): Promise<Locator[]> {
		const columnMap: Record<string, number> = {
			ID: 0,
			Name: 1,
			Email: 2,
			Status: 3,
			Role: 4
		};

		const columnIndex = columnMap[column];
		const matchingRows: Locator[] = [];
		const rows = await this.dataTable.locator('tbody tr').all();

		for (const row of rows) {
			const cells = await row.locator('td').all();
			if (cells.length > columnIndex) {
				const cellText = await cells[columnIndex].textContent();
				if (cellText?.trim() === value) {
					matchingRows.push(row);
				}
			}
		}

		return matchingRows;
	}
}
