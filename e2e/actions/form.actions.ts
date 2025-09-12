import { expect, Locator, Page } from '@playwright/test';

/**
 * Form Actions Helper Class
 * Provides standardized methods for interacting with form elements
 */
export class FormActions {
	constructor(private page: Page) {}

	/**
	 * Fill a text field with proper clearing first
	 */
	async fillTextField(
		selector: string | Locator,
		value: string,
		options?: { clear?: boolean; verify?: boolean }
	): Promise<void> {
		const opts = { clear: true, verify: true, ...options };
		const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;

		if (opts.clear) {
			await locator.click();
			await locator.fill('');
		}

		await locator.fill(value);

		if (opts.verify) {
			const actualValue = await locator.inputValue();
			expect(actualValue).toBe(value);
		}
	}

	/**
	 * Clear a text field reliably
	 */
	async clearField(selector: string | Locator): Promise<void> {
		const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
		await locator.click();
		await locator.fill('');

		// Verify it's empty
		const value = await locator.inputValue();
		if (value !== '') {
			await locator.clear();
		}
	}

	/**
	 * Select a dropdown option
	 */
	async selectDropdownOption(
		triggerSelector: string | Locator,
		optionValue: string
	): Promise<void> {
		const trigger =
			typeof triggerSelector === 'string' ? this.page.locator(triggerSelector) : triggerSelector;

		// Click the trigger to open dropdown
		await trigger.click();

		// Wait for dropdown to be visible and select option
		await this.page.locator(`[data-value="${optionValue}"]`).click();

		// Verify selection (if trigger has text content)
		const selectedText = await trigger.textContent();
		if (selectedText && !selectedText.includes('Select')) {
			expect(selectedText).toContain(optionValue);
		}
	}

	/**
	 * Toggle a checkbox
	 */
	async toggleCheckbox(selector: string | Locator, shouldBeChecked?: boolean): Promise<void> {
		const checkbox = typeof selector === 'string' ? this.page.locator(selector) : selector;

		if (shouldBeChecked !== undefined) {
			await checkbox.setChecked(shouldBeChecked);
		} else {
			await checkbox.click();
		}

		// Verify state if requested
		if (shouldBeChecked !== undefined) {
			const isChecked = await checkbox.isChecked();
			expect(isChecked).toBe(shouldBeChecked);
		}
	}

	/**
	 * Select a radio option
	 */
	async selectRadioOption(selector: string | Locator): Promise<void> {
		const radio = typeof selector === 'string' ? this.page.locator(selector) : selector;
		await radio.click();

		// Verify it's selected
		const isChecked = await radio.isChecked();
		expect(isChecked).toBe(true);
	}

	/**
	 * Toggle a switch
	 */
	async toggleSwitch(selector: string | Locator, shouldBeOn?: boolean): Promise<void> {
		const switchElement = typeof selector === 'string' ? this.page.locator(selector) : selector;

		if (shouldBeOn !== undefined) {
			const currentState = (await switchElement.getAttribute('data-state')) === 'checked';
			if (currentState !== shouldBeOn) {
				await switchElement.click();
			}
		} else {
			await switchElement.click();
		}

		// Verify state if requested
		if (shouldBeOn !== undefined) {
			const state = await switchElement.getAttribute('data-state');
			expect(state === 'checked').toBe(shouldBeOn);
		}
	}

	/**
	 * Submit a form and wait for response
	 */
	async submitFormAndWait(
		submitButtonSelector: string | Locator,
		options?: {
			waitForNavigation?: boolean;
			waitForResponse?: string | RegExp;
			timeout?: number;
		}
	): Promise<void> {
		const opts = { timeout: 5000, ...options };
		const submitButton =
			typeof submitButtonSelector === 'string'
				? this.page.locator(submitButtonSelector)
				: submitButtonSelector;

		// Handle different wait scenarios
		if (opts.waitForNavigation) {
			await Promise.all([
				this.page.waitForNavigation({ timeout: opts.timeout }),
				submitButton.click()
			]);
		} else if (opts.waitForResponse) {
			await Promise.all([
				this.page.waitForResponse(opts.waitForResponse, { timeout: opts.timeout }),
				submitButton.click()
			]);
		} else {
			await submitButton.click();
			// Wait for any loading states to complete
			await this.page.waitForLoadState('networkidle', { timeout: opts.timeout });
		}
	}

	/**
	 * Fill an entire form with data
	 */
	async fillForm(formData: Record<string, string | number | boolean>): Promise<void> {
		for (const [fieldName, value] of Object.entries(formData)) {
			const field = this.page
				.locator(`[name="${fieldName}"], [data-testid="${fieldName}"]`)
				.first();

			// Determine field type and fill accordingly
			const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
			const type = await field.getAttribute('type');

			if (tagName === 'input') {
				if (type === 'checkbox' || type === 'radio') {
					await this.toggleCheckbox(field, value);
				} else {
					await this.fillTextField(field, String(value));
				}
			} else if (tagName === 'textarea') {
				await this.fillTextField(field, String(value));
			} else if (tagName === 'select') {
				await field.selectOption(value);
			}
		}
	}

	/**
	 * Validate form field has error
	 */
	async validateFieldError(fieldSelector: string | Locator, expectedError?: string): Promise<void> {
		const field =
			typeof fieldSelector === 'string' ? this.page.locator(fieldSelector) : fieldSelector;

		// Look for associated error message
		const fieldId = await field.getAttribute('id');
		const errorSelector = fieldId
			? `[id="${fieldId}-error"], [data-testid="${fieldId}-error"]`
			: '.field-error, .error-message';

		const errorElement = this.page.locator(errorSelector).first();
		await expect(errorElement).toBeVisible();

		if (expectedError) {
			const errorText = await errorElement.textContent();
			expect(errorText).toContain(expectedError);
		}
	}

	/**
	 * Get form values as an object
	 */
	async getFormValues(formSelector: string | Locator): Promise<Record<string, string | boolean>> {
		const form = typeof formSelector === 'string' ? this.page.locator(formSelector) : formSelector;

		return await form.evaluate((formEl) => {
			const formData: Record<string, string | boolean> = {};
			const inputs = formEl.querySelectorAll('input, textarea, select');

			inputs.forEach((input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
				const name = input.name || input.getAttribute('data-testid');
				if (!name) return;

				if (input instanceof HTMLInputElement) {
					if (input.type === 'checkbox') {
						formData[name] = input.checked;
					} else if (input.type === 'radio') {
						if (input.checked) {
							formData[name] = input.value;
						}
					} else {
						formData[name] = input.value;
					}
				} else {
					formData[name] = input.value;
				}
			});

			return formData;
		});
	}

	/**
	 * Wait for form to be ready (no loading states)
	 */
	async waitForFormReady(timeout = 2000): Promise<void> {
		// Wait for any loading indicators to disappear
		await this.page.waitForFunction(
			() => {
				const loadingElements = document.querySelectorAll(
					'.loading, .spinner, [aria-busy="true"], button:disabled:has-text("Loading")'
				);
				return loadingElements.length === 0;
			},
			{ timeout }
		);

		// Wait for all form fields to be enabled
		await this.page.waitForFunction(
			() => {
				const formFields = document.querySelectorAll(
					'input, textarea, select, button[type="submit"]'
				);
				return Array.from(formFields).every((field) => {
					return !(
						field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
					).disabled;
				});
			},
			{ timeout }
		);
	}
}
