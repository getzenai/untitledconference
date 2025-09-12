import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
	readonly path = '/login';

	private readonly emailInput: Locator;
	private readonly passwordInput: Locator;
	private readonly loginButton: Locator;
	private readonly errorMessage: Locator;
	private readonly registerLink: Locator;
	private readonly rememberMeCheckbox: Locator;

	constructor(page: Page) {
		super(page);
		this.emailInput = page.getByLabel('Email');
		this.passwordInput = page.getByLabel('Password');
		this.loginButton = page.getByRole('button', { name: 'Login' });
		this.errorMessage = page
			.locator('[role="alert"], .error-message, .text-red-500, .text-destructive')
			.first();
		this.registerLink = page.getByRole('link', { name: /register/i });
		this.rememberMeCheckbox = page.getByLabel('Remember me');
	}

	async login(email: string, password: string, rememberMe = false): Promise<void> {
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);

		if (rememberMe && (await this.rememberMeCheckbox.isVisible())) {
			await this.rememberMeCheckbox.check();
		}

		await this.loginButton.click();
	}

	async loginAndWaitForRedirect(
		email: string,
		password: string,
		expectedUrl = '/home'
	): Promise<void> {
		await this.login(email, password);
		await this.waitForNavigation(expectedUrl);
	}

	async getEmailValue(): Promise<string> {
		return await this.emailInput.inputValue();
	}

	async getPasswordValue(): Promise<string> {
		return await this.passwordInput.inputValue();
	}

	async isLoginButtonEnabled(): Promise<boolean> {
		return await this.loginButton.isEnabled();
	}

	async isErrorVisible(): Promise<boolean> {
		try {
			// Wait a bit for error to appear after form submission
			await this.errorMessage.waitFor({ state: 'visible', timeout: 2000 });
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

	async clickRegisterLink(): Promise<void> {
		await this.registerLink.click();
	}

	async isEmailInputVisible(): Promise<boolean> {
		return await this.emailInput.isVisible();
	}

	async isPasswordInputVisible(): Promise<boolean> {
		return await this.passwordInput.isVisible();
	}

	async clearForm(): Promise<void> {
		await this.emailInput.clear();
		await this.passwordInput.clear();
	}

	async submitEmptyForm(): Promise<void> {
		await this.clearForm();
		await this.loginButton.click();
	}

	async isOnLoginPage(): Promise<boolean> {
		const url = await this.getCurrentURL();
		return url.includes('/login');
	}
}
