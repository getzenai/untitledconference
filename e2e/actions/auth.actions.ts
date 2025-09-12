import { Page } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { RegisterPage } from '../pages/register.page';
import { TestUser, testUserManager } from '../test-user-manager';

export class AuthActions {
	private page: Page;
	private loginPage: LoginPage;
	private homePage: HomePage;
	private registerPage: RegisterPage;

	constructor(page: Page) {
		this.page = page;
		this.loginPage = new LoginPage(page);
		this.homePage = new HomePage(page);
		this.registerPage = new RegisterPage(page);
	}

	async login(email: string, password: string): Promise<void> {
		await this.loginPage.goto();
		await this.loginPage.loginAndWaitForRedirect(email, password);
		await this.homePage.waitForDashboardLoad();
	}

	async loginWithoutRedirect(email: string, password: string): Promise<void> {
		await this.loginPage.goto();
		await this.loginPage.login(email, password);
	}

	async logout(): Promise<void> {
		if (!(await this.homePage.isLoggedIn())) {
			return;
		}
		await this.homePage.logout();
	}

	async register(email: string, password: string, organizationName?: string): Promise<void> {
		await this.registerPage.goto();
		await this.registerPage.registerAndWaitForRedirect(email, password, password, organizationName);
		await this.homePage.waitForDashboardLoad();
	}

	async registerWithoutRedirect(
		email: string,
		password: string,
		confirmPassword: string,
		organizationName?: string
	): Promise<void> {
		await this.registerPage.goto();
		await this.registerPage.register(email, password, confirmPassword, organizationName);
	}

	async switchUser(newUser: TestUser): Promise<void> {
		await this.logout();
		await this.login(newUser.email, newUser.password);
	}

	async ensureLoggedIn(user?: TestUser): Promise<void> {
		const isLoggedIn = await this.homePage.isLoggedIn();

		if (!isLoggedIn) {
			if (!user) {
				throw new Error('User credentials required to log in');
			}
			await this.login(user.email, user.password);
		}
	}

	async createAndLogin(
		email?: string,
		password?: string,
		organizationName?: string
	): Promise<TestUser> {
		const user = await testUserManager.createTestUser({
			email: email || testUserManager.generateTestUserEmail('auth-action'),
			password: password || 'password123',
			organizationName
		});

		await this.login(user.email, user.password);
		return user;
	}

	async isAuthenticated(): Promise<boolean> {
		const currentUrl = this.page.url();
		if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
			return false;
		}

		return await this.homePage.isLoggedIn();
	}

	async getCurrentUserEmail(): Promise<string | null> {
		if (!(await this.isAuthenticated())) {
			return null;
		}

		return await this.homePage.getUserEmail();
	}

	async navigateToLoginPage(): Promise<void> {
		await this.loginPage.goto();
	}

	async navigateToRegisterPage(): Promise<void> {
		await this.registerPage.goto();
	}

	async navigateToHomePage(): Promise<void> {
		await this.homePage.goto();
	}

	async validateLoginError(expectedError: string): Promise<boolean> {
		const errorText = await this.loginPage.getErrorText();
		return errorText?.includes(expectedError) || false;
	}

	async validateRegisterError(expectedError: string): Promise<boolean> {
		const errorText = await this.registerPage.getErrorText();
		return errorText?.includes(expectedError) || false;
	}

	async clearLoginForm(): Promise<void> {
		await this.loginPage.clearForm();
	}

	async clearRegisterForm(): Promise<void> {
		await this.registerPage.clearForm();
	}

	async attemptLoginWithEmptyCredentials(): Promise<void> {
		await this.loginPage.goto();
		await this.loginPage.submitEmptyForm();
	}

	async getSessionToken(): Promise<string | undefined> {
		const cookies = await this.page.context().cookies();
		const sessionCookie = cookies.find((c) => c.name === 'better-auth.session_token');
		return sessionCookie?.value;
	}

	async setSessionToken(token: string): Promise<void> {
		await this.page.context().addCookies([
			{
				name: 'better-auth.session_token',
				value: token,
				domain: new URL(this.page.url()).hostname,
				path: '/',
				httpOnly: true,
				secure: false,
				sameSite: 'Lax'
			}
		]);
	}

	async clearSession(): Promise<void> {
		await this.page.context().clearCookies();
	}
}
