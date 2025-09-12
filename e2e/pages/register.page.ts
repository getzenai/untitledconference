import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class RegisterPage extends BasePage {
	readonly path = '/register';

	private readonly emailInput: Locator;
	private readonly passwordInput: Locator;
	private readonly confirmPasswordInput: Locator;
	private readonly organizationNameInput: Locator;
	private readonly registerButton: Locator;
	private readonly loginLink: Locator;
	private readonly errorMessage: Locator;
	private readonly successMessage: Locator;

	constructor(page: Page) {
		super(page);
		this.emailInput = page.getByLabel('Email');
		this.passwordInput = page.getByLabel('Password', { exact: true });
		this.confirmPasswordInput = page.getByLabel('Confirm Password');
		this.organizationNameInput = page.getByLabel('Organization Name');
		this.registerButton = page.getByRole('button', { name: 'Register' });
		this.loginLink = page.getByRole('link', { name: /login/i });
		this.errorMessage = page
			.locator('[role="alert"], .error-message, .text-red-500, .text-destructive')
			.first();
		this.successMessage = page.locator('.success-message, [role="status"]').first();
	}

	async register(
		email: string,
		password: string,
		confirmPassword: string,
		organizationName?: string
	): Promise<void> {
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);
		await this.confirmPasswordInput.fill(confirmPassword);

		if (organizationName && (await this.organizationNameInput.isVisible())) {
			await this.organizationNameInput.fill(organizationName);
		}

		await this.registerButton.click();
		// Wait for either successful navigation or error message
		await this.page.waitForLoadState('networkidle');
	}

	async registerAndWaitForRedirect(
		email: string,
		password: string,
		confirmPassword: string,
		organizationName?: string,
		expectedUrl = '/home'
	): Promise<void> {
		await this.register(email, password, confirmPassword, organizationName);
		await this.waitForNavigation(expectedUrl);
	}

	async fillEmail(email: string): Promise<void> {
		await this.emailInput.fill(email);
	}

	async fillPassword(password: string): Promise<void> {
		await this.passwordInput.fill(password);
	}

	async fillConfirmPassword(confirmPassword: string): Promise<void> {
		await this.confirmPasswordInput.fill(confirmPassword);
	}

	async fillOrganizationName(organizationName: string): Promise<void> {
		if (await this.organizationNameInput.isVisible()) {
			await this.organizationNameInput.fill(organizationName);
		}
	}

	async clickRegisterButton(): Promise<void> {
		await this.registerButton.click();
	}

	async clickLoginLink(): Promise<void> {
		await this.loginLink.click();
	}

	async isErrorVisible(): Promise<boolean> {
		return await this.errorMessage.isVisible();
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

	async isRegisterButtonEnabled(): Promise<boolean> {
		return await this.registerButton.isEnabled();
	}

	async clearForm(): Promise<void> {
		await this.emailInput.clear();
		await this.passwordInput.clear();
		await this.confirmPasswordInput.clear();
		if (await this.organizationNameInput.isVisible()) {
			await this.organizationNameInput.clear();
		}
	}

	async isOnRegisterPage(): Promise<boolean> {
		const url = await this.getCurrentURL();
		return url.includes('/register');
	}

	async validatePasswordsMatch(): Promise<boolean> {
		const password = await this.passwordInput.inputValue();
		const confirmPassword = await this.confirmPasswordInput.inputValue();
		return password === confirmPassword;
	}

	async isOrganizationFieldVisible(): Promise<boolean> {
		return await this.organizationNameInput.isVisible();
	}
}
