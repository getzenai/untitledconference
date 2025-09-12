import { Locator, Page, expect } from '@playwright/test';

export abstract class BasePage {
	protected readonly page: Page;
	protected readonly baseURL: string;

	constructor(page: Page) {
		this.page = page;
		this.baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174';
	}

	abstract readonly path: string;

	async goto(): Promise<void> {
		await this.page.goto(this.path);
		await this.waitForPageLoad();
	}

	async waitForPageLoad(): Promise<void> {
		await this.page.waitForLoadState('domcontentloaded');
		await this.page.waitForLoadState('networkidle', { timeout: 5000 });
	}

	async takeScreenshot(name: string): Promise<void> {
		await this.page.screenshot({
			path: `e2e/screenshots/${name}-${Date.now()}.png`,
			fullPage: true
		});
	}

	async waitForElement(locator: Locator): Promise<void> {
		await expect(locator).toBeVisible();
	}

	async waitForElementHidden(locator: Locator): Promise<void> {
		await expect(locator).toBeHidden();
	}

	/**
	 * Fill a field with proper clearing first
	 * Clicks the field, clears it, then fills with new value
	 */
	async fillFieldWithClear(locator: Locator, value: string): Promise<void> {
		await locator.click(); // Focus the field
		await locator.fill(''); // Clear by filling with empty string
		await locator.fill(value);
		// Verify the value was entered
		const actualValue = await locator.inputValue();
		if (actualValue !== value) {
			throw new Error(`Failed to fill field. Expected "${value}" but got "${actualValue}"`);
		}
	}

	/**
	 * Clear a field reliably
	 */
	async clearField(locator: Locator): Promise<void> {
		await locator.click();
		await locator.fill('');
		// Verify it's empty
		const value = await locator.inputValue();
		if (value !== '') {
			// Try alternative clear method
			await locator.clear();
		}
	}

	/**
	 * Wait for a button to be ready (not in loading state)
	 */
	async waitForButtonReady(buttonText: string): Promise<void> {
		await this.page.waitForFunction((text) => {
			const buttons = Array.from(document.querySelectorAll('button'));
			const button = buttons.find((btn) => btn.textContent?.includes(text));
			return button && !button.disabled && !button.classList.contains('loading');
		}, buttonText);
	}

	async getErrorMessage(): Promise<string | null> {
		const errorLocator = this.page.locator('[role="alert"], .error, .error-message').first();
		const isVisible = await errorLocator.isVisible();
		if (isVisible) {
			return await errorLocator.textContent();
		}
		return null;
	}

	async waitForNavigation(url: string | RegExp): Promise<void> {
		await this.page.waitForURL(url, { timeout: 5000 });
	}

	async isElementVisible(locator: Locator): Promise<boolean> {
		return await locator.isVisible();
	}

	async scrollToElement(locator: Locator): Promise<void> {
		await locator.scrollIntoViewIfNeeded();
	}

	async getElementText(locator: Locator): Promise<string> {
		return (await locator.textContent()) || '';
	}

	async waitForAPIResponse(urlPattern: string | RegExp): Promise<void> {
		await this.page.waitForResponse(
			(response) => {
				const url = response.url();
				if (typeof urlPattern === 'string') {
					return url.includes(urlPattern);
				}
				return urlPattern.test(url);
			},
			{ timeout: 5000 }
		);
	}

	async getCurrentURL(): Promise<string> {
		return this.page.url();
	}

	async reload(): Promise<void> {
		await this.page.reload();
		await this.waitForPageLoad();
	}

	async waitForText(text: string): Promise<void> {
		await expect(this.page.getByText(text)).toBeVisible();
	}

	async waitForTextHidden(text: string): Promise<void> {
		await expect(this.page.getByText(text)).toBeHidden();
	}
}
