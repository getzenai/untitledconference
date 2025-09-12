import { FormActions } from '../actions/form.actions';
import { expect, test } from '../fixtures/test';
import { UIComponentsPage } from '../pages/ui-components.page';

/**
 * UI Components Test Suite
 *
 * Comprehensive tests for all UI components in the showcase page.
 * These tests verify that our standardized form actions and UI helpers work correctly.
 */
test.describe('UI Components Showcase', () => {
	let uiPage: UIComponentsPage;
	let formActions: FormActions;

	test.beforeEach(async ({ page }) => {
		uiPage = new UIComponentsPage(page);
		formActions = new FormActions(page);
		await uiPage.goto();
		await uiPage.waitForPageLoad();
	});

	test.describe('Form Controls', () => {
		test('text inputs work correctly', async () => {
			// Test text input
			await formActions.fillTextField(uiPage.textInput, 'Hello World');
			expect(await uiPage.getInputValue(uiPage.textInput)).toBe('Hello World');

			// Test clearing and refilling
			await formActions.clearField(uiPage.textInput);
			expect(await uiPage.getInputValue(uiPage.textInput)).toBe('');
			await formActions.fillTextField(uiPage.textInput, 'New Value');
			expect(await uiPage.getInputValue(uiPage.textInput)).toBe('New Value');

			// Test email input
			await formActions.fillTextField(uiPage.emailInput, 'test@example.com');
			expect(await uiPage.getInputValue(uiPage.emailInput)).toBe('test@example.com');

			// Test password input
			await formActions.fillTextField(uiPage.passwordInput, 'SecurePass123');
			expect(await uiPage.getInputValue(uiPage.passwordInput)).toBe('SecurePass123');

			// Test number input
			await formActions.fillTextField(uiPage.numberInput, '42');
			expect(await uiPage.getInputValue(uiPage.numberInput)).toBe('42');

			// Test textarea
			await formActions.fillTextField(uiPage.textarea, 'Multi-line\ntext content');
			expect(await uiPage.getInputValue(uiPage.textarea)).toBe('Multi-line\ntext content');
		});

		test('checkboxes work correctly', async () => {
			// Test single checkbox
			expect(await uiPage.isChecked(uiPage.singleCheckbox)).toBe(false);
			await formActions.toggleCheckbox(uiPage.singleCheckbox, true);
			expect(await uiPage.isChecked(uiPage.singleCheckbox)).toBe(true);
			await formActions.toggleCheckbox(uiPage.singleCheckbox, false);
			expect(await uiPage.isChecked(uiPage.singleCheckbox)).toBe(false);

			// Test checkbox group
			await formActions.toggleCheckbox(uiPage.checkboxOption1, true);
			await formActions.toggleCheckbox(uiPage.checkboxOption2, true);
			await formActions.toggleCheckbox(uiPage.checkboxOption3, false);

			expect(await uiPage.isChecked(uiPage.checkboxOption1)).toBe(true);
			expect(await uiPage.isChecked(uiPage.checkboxOption2)).toBe(true);
			expect(await uiPage.isChecked(uiPage.checkboxOption3)).toBe(false);
		});

		test('radio buttons work correctly', async () => {
			// Select different radio options
			await formActions.selectRadioOption(uiPage.radioOption1);
			expect(await uiPage.isChecked(uiPage.radioOption1)).toBe(true);
			expect(await uiPage.isChecked(uiPage.radioOption2)).toBe(false);

			await formActions.selectRadioOption(uiPage.radioOption2);
			expect(await uiPage.isChecked(uiPage.radioOption1)).toBe(false);
			expect(await uiPage.isChecked(uiPage.radioOption2)).toBe(true);

			await formActions.selectRadioOption(uiPage.radioOption3);
			expect(await uiPage.isChecked(uiPage.radioOption3)).toBe(true);
		});

		test('switch toggle works correctly', async () => {
			// Test switch toggle
			const initialState = await uiPage.switch.getAttribute('data-state');
			expect(initialState).toBe('unchecked');

			await formActions.toggleSwitch(uiPage.switch, true);
			expect(await uiPage.switch.getAttribute('data-state')).toBe('checked');

			await formActions.toggleSwitch(uiPage.switch, false);
			expect(await uiPage.switch.getAttribute('data-state')).toBe('unchecked');
		});

		test('select dropdown works correctly', async () => {
			// Select different options
			await uiPage.selectOption('option1');
			await expect(uiPage.selectTrigger).toContainText('Option 1');

			await uiPage.selectOption('option2');
			await expect(uiPage.selectTrigger).toContainText('Option 2');

			await uiPage.selectOption('option3');
			await expect(uiPage.selectTrigger).toContainText('Option 3');
		});

		test('form submission works', async () => {
			// Fill the entire form
			await uiPage.fillTestForm();

			// Submit the form
			await uiPage.submitForm();

			// Verify toast appears
			await uiPage.waitForToast();
			const toast = uiPage.page.locator('[data-sonner-toast]').first();
			await expect(toast).toContainText('Form submitted successfully');
		});
	});

	test.describe('Buttons & Actions', () => {
		test('all button variants are clickable', async () => {
			// Test each button variant
			const buttons = [
				uiPage.buttonDefault,
				uiPage.buttonSecondary,
				uiPage.buttonDestructive,
				uiPage.buttonOutline,
				uiPage.buttonGhost,
				uiPage.buttonLink
			];

			for (const button of buttons) {
				await expect(button).toBeEnabled();
				await button.click();
			}

			// Verify disabled button is not clickable
			await expect(uiPage.buttonDisabled).toBeDisabled();
		});

		test('loading button state works', async ({ page }) => {
			// Click loading button
			await uiPage.buttonLoading.click();

			// Verify button shows loading state
			await expect(uiPage.buttonLoading).toContainText('Loading...');
			await expect(uiPage.buttonLoading).toBeDisabled();

			// Wait for loading to complete
			await page.waitForTimeout(2500);

			// Verify button returns to normal state
			await expect(uiPage.buttonLoading).toContainText('Click for Loading State');
			await expect(uiPage.buttonLoading).toBeEnabled();

			// Verify success toast
			await uiPage.waitForToast();
		});
	});

	test.describe('Feedback Components', () => {
		test('alerts are visible', async () => {
			await expect(uiPage.alertDefault).toBeVisible();
			await expect(uiPage.alertDefault).toContainText('Default Alert');

			await expect(uiPage.alertDestructive).toBeVisible();
			await expect(uiPage.alertDestructive).toContainText('Error Alert');
		});

		test('badges are visible', async () => {
			await expect(uiPage.badgeDefault).toBeVisible();
			await expect(uiPage.badgeSecondary).toBeVisible();
			await expect(uiPage.badgeDestructive).toBeVisible();
			await expect(uiPage.badgeOutline).toBeVisible();
		});

		test('progress bar updates correctly', async () => {
			// Check initial value
			let progress = await uiPage.getProgressValue();
			expect(progress).toBe(33);

			// Increase progress
			await uiPage.updateProgress(true);
			progress = await uiPage.getProgressValue();
			expect(progress).toBe(43);

			// Decrease progress
			await uiPage.updateProgress(false);
			await uiPage.updateProgress(false);
			progress = await uiPage.getProgressValue();
			expect(progress).toBe(23);
		});

		test('toast notifications work', async ({ page }) => {
			// Test each toast type
			const toastTypes: Array<'success' | 'error' | 'info' | 'warning'> = [
				'success',
				'error',
				'info',
				'warning'
			];

			for (const type of toastTypes) {
				await uiPage.triggerToast(type);
				await uiPage.waitForToast();

				const toast = page.locator('[data-sonner-toast]').last();
				await expect(toast).toBeVisible();

				// Wait for toast to auto-dismiss
				await uiPage.waitForToastToDisappear();
			}
		});
	});

	test.describe('Overlay Components', () => {
		test('dialog open and close works', async () => {
			// Open dialog
			await uiPage.openDialog();
			await expect(uiPage.dialogContent).toBeVisible();

			// Fill dialog input
			await formActions.fillTextField(uiPage.dialogInput, 'Dialog test input');
			expect(await uiPage.getInputValue(uiPage.dialogInput)).toBe('Dialog test input');

			// Cancel dialog
			await uiPage.closeDialog(false);
			await expect(uiPage.dialogContent).not.toBeVisible();

			// Open and confirm dialog
			await uiPage.openDialog();
			await uiPage.closeDialog(true);
			await expect(uiPage.dialogContent).not.toBeVisible();

			// Verify confirmation toast
			await uiPage.waitForToast();
			const toast = uiPage.page.locator('[data-sonner-toast]').first();
			await expect(toast).toContainText('Dialog confirmed');
		});

		test('alert dialog works correctly', async () => {
			// Open alert dialog
			await uiPage.openAlertDialog();
			await expect(uiPage.alertDialogContent).toBeVisible();
			await expect(uiPage.alertDialogContent).toContainText('Are you sure?');

			// Cancel alert dialog
			await uiPage.alertDialogCancel.click();
			await expect(uiPage.alertDialogContent).toBeHidden();

			// Open and confirm alert dialog
			await uiPage.openAlertDialog();
			await uiPage.alertDialogConfirm.click();
			await expect(uiPage.alertDialogContent).toBeHidden();

			// Verify confirmation toast
			await uiPage.waitForToast();
			const toast = uiPage.page.locator('[data-sonner-toast]').first();
			await expect(toast).toContainText('Action confirmed');
		});
	});

	test.describe('Data Display Components', () => {
		test('table data extraction works', async () => {
			// Find row by name and extract email
			const email = await uiPage.getTableCellValue('Name', 'Jane Smith', 'Email');
			expect(email).toBe('jane@example.com');

			// Find row by email and extract role
			const role = await uiPage.getTableCellValue('Email', 'bob@example.com', 'Role');
			expect(role).toBe('User');

			// Find row by ID and extract status
			const status = await uiPage.getTableCellValue('ID', '4', 'Status');
			expect(status).toBe('Active');

			// Verify all users with Admin role
			const adminRows = await uiPage.getRowsByColumnValue('Role', 'Admin');
			expect(adminRows).toHaveLength(1);
			expect(await adminRows[0].locator('[data-testid*="table-cell-name"]').textContent()).toBe(
				'John Doe'
			);

			// Verify all active users
			const activeRows = await uiPage.getRowsByColumnValue('Status', 'Active');
			expect(activeRows).toHaveLength(3); // John, Jane, Alice
		});
	});

	test.describe('Layout Components', () => {
		test('accordion expand and collapse works', async () => {
			// Initially all should be collapsed
			expect(await uiPage.isAccordionOpen(1)).toBe(false);
			expect(await uiPage.isAccordionOpen(2)).toBe(false);
			expect(await uiPage.isAccordionOpen(3)).toBe(false);

			// Open first accordion
			await uiPage.toggleAccordion(1);
			await expect(uiPage.accordionContent1).toBeVisible();

			// Open second accordion (single type, so first should close)
			await uiPage.toggleAccordion(2);
			await expect(uiPage.accordionContent2).toBeVisible();
			await expect(uiPage.accordionContent1).toBeHidden();

			// Close second accordion by clicking it again
			await uiPage.toggleAccordion(2);
			await expect(uiPage.accordionContent2).toBeHidden();
		});

		test('tabs switching works', async ({ page }) => {
			// Wait for tabs to be ready
			await page.waitForTimeout(200);

			// Click first tab to ensure it's active
			await uiPage.switchToTab(1);
			await page.waitForTimeout(200);
			expect(await uiPage.isTabActive(1)).toBe(true);
			expect(await uiPage.isTabActive(2)).toBe(false);
			expect(await uiPage.isTabActive(3)).toBe(false);

			// Switch to second tab
			await uiPage.switchToTab(2);
			await page.waitForTimeout(200);
			expect(await uiPage.isTabActive(1)).toBe(false);
			expect(await uiPage.isTabActive(2)).toBe(true);
			expect(await uiPage.isTabActive(3)).toBe(false);

			// Switch to third tab
			await uiPage.switchToTab(3);
			await page.waitForTimeout(200);
			expect(await uiPage.isTabActive(1)).toBe(false);
			expect(await uiPage.isTabActive(2)).toBe(false);
			expect(await uiPage.isTabActive(3)).toBe(true);

			// Switch back to first tab
			await uiPage.switchToTab(1);
			await page.waitForTimeout(200);
			expect(await uiPage.isTabActive(1)).toBe(true);
		});
	});

	test('complete form workflow with all components', async ({ page }) => {
		// Fill all form fields using our new form actions
		await formActions.fillTextField(uiPage.textInput, 'Complete Test');
		await formActions.fillTextField(uiPage.emailInput, 'complete@test.com');
		await formActions.fillTextField(uiPage.passwordInput, 'CompletePass123');
		await formActions.fillTextField(uiPage.numberInput, '100');
		await formActions.fillTextField(
			uiPage.textarea,
			'This is a complete test of all form components'
		);

		// Set checkboxes
		await formActions.toggleCheckbox(uiPage.singleCheckbox, true);
		await formActions.toggleCheckbox(uiPage.checkboxOption1, true);
		await formActions.toggleCheckbox(uiPage.checkboxOption2, false);
		await formActions.toggleCheckbox(uiPage.checkboxOption3, true);

		// Select radio
		await formActions.selectRadioOption(uiPage.radioOption3);

		// Toggle switch
		await formActions.toggleSwitch(uiPage.switch, true);

		// Select dropdown option
		await uiPage.selectOption('option3');

		// Submit form
		await formActions.submitFormAndWait(uiPage.submitButton, {
			timeout: 2000
		});

		// Verify success toast
		await uiPage.waitForToast();
		const toast = page.locator('[data-sonner-toast]').first();
		await expect(toast).toContainText('Form submitted successfully');
	});
});
