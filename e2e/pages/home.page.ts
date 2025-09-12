import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
	readonly path = '/home';

	private readonly welcomeMessage: Locator;
	private readonly userMenu: Locator;
	private readonly logoutButton: Locator;
	private readonly navigationMenu: Locator;
	private readonly examplesLink: Locator;
	private readonly crudLink: Locator;
	private readonly organizationLink: Locator;
	private readonly adminLink: Locator;
	private readonly profileLink: Locator;
	private readonly dashboardContent: Locator;

	constructor(page: Page) {
		super(page);
		this.welcomeMessage = page.locator('h1, h2').filter({ hasText: /welcome/i });
		this.userMenu = page.locator('[data-testid="user-menu"], .user-menu, [aria-label*="user"]');
		this.logoutButton = page.getByRole('button', { name: 'Logout', exact: true }).last();
		this.navigationMenu = page.locator('nav, [role="navigation"]');
		this.examplesLink = page.getByRole('link', { name: /examples/i });
		this.crudLink = page.getByRole('link', { name: /crud/i });
		this.organizationLink = page.getByRole('link', { name: /organization/i });
		this.adminLink = page.getByRole('link', { name: /admin/i });
		this.profileLink = page.getByRole('link', { name: /profile/i });
		this.dashboardContent = page.locator('main, .dashboard-content');
	}

	async isWelcomeMessageVisible(): Promise<boolean> {
		return await this.welcomeMessage.isVisible();
	}

	async getWelcomeText(): Promise<string> {
		return await this.getElementText(this.welcomeMessage);
	}

	async logout(): Promise<void> {
		if (await this.userMenu.isVisible()) {
			await this.userMenu.click();
		}
		await this.logoutButton.click();
		await this.waitForNavigation('/login');
	}

	async navigateToExamples(): Promise<void> {
		await this.examplesLink.click();
	}

	async navigateToCrud(): Promise<void> {
		await this.crudLink.click();
		await this.waitForNavigation('/examples/crud');
	}

	async navigateToOrganization(): Promise<void> {
		await this.organizationLink.click();
	}

	async navigateToAdmin(): Promise<void> {
		await this.adminLink.click();
	}

	async navigateToProfile(): Promise<void> {
		if (await this.userMenu.isVisible()) {
			await this.userMenu.click();
		}
		await this.profileLink.click();
	}

	async isUserMenuVisible(): Promise<boolean> {
		return await this.userMenu.isVisible();
	}

	async isAdminLinkVisible(): Promise<boolean> {
		return await this.adminLink.isVisible();
	}

	async isOrganizationLinkVisible(): Promise<boolean> {
		return await this.organizationLink.isVisible();
	}

	async isDashboardContentVisible(): Promise<boolean> {
		return await this.dashboardContent.isVisible();
	}

	async isLoggedIn(): Promise<boolean> {
		const url = await this.getCurrentURL();
		return url.includes('/home') && (await this.isDashboardContentVisible());
	}

	async getUserEmail(): Promise<string | null> {
		const userEmailElement = this.page.locator('[data-testid="user-email"], .user-email');
		if (await userEmailElement.isVisible()) {
			return await userEmailElement.textContent();
		}
		return null;
	}

	async getOrganizationName(): Promise<string | null> {
		const orgElement = this.page.locator('[data-testid="org-name"], .organization-name');
		if (await orgElement.isVisible()) {
			return await orgElement.textContent();
		}
		return null;
	}

	async waitForDashboardLoad(): Promise<void> {
		await this.waitForElement(this.dashboardContent);
		await this.waitForPageLoad();
	}
}
