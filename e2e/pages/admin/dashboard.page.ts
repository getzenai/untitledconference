import { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class AdminDashboardPage extends BasePage {
	readonly path = '/admin';

	private readonly dashboardTitle: Locator;
	private readonly usersSection: Locator;
	private readonly organizationsSection: Locator;
	private readonly usersList: Locator;
	private readonly organizationsList: Locator;
	private readonly searchUsersInput: Locator;
	private readonly searchOrgsInput: Locator;
	private readonly banUserButton: Locator;
	private readonly unbanUserButton: Locator;
	private readonly deleteUserButton: Locator;
	private readonly deleteOrgButton: Locator;
	private readonly userDetailsButton: Locator;
	private readonly orgDetailsButton: Locator;
	private readonly refreshButton: Locator;
	private readonly statsSection: Locator;
	private readonly totalUsersCount: Locator;
	private readonly totalOrgsCount: Locator;
	private readonly activeUsersCount: Locator;
	private readonly bannedUsersCount: Locator;

	constructor(page: Page) {
		super(page);
		this.dashboardTitle = page.locator('h1').filter({ hasText: /admin dashboard/i });
		this.usersSection = page.locator('[data-testid="users-section"], .users-section');
		this.organizationsSection = page.locator(
			'[data-testid="orgs-section"], .organizations-section'
		);
		this.usersList = page.locator('[data-testid="users-list"], .users-list');
		this.organizationsList = page.locator('[data-testid="orgs-list"], .organizations-list');
		this.searchUsersInput = page.getByPlaceholder(/search users/i);
		this.searchOrgsInput = page.getByPlaceholder(/search organizations/i);
		this.banUserButton = page.getByRole('button', { name: /ban/i });
		this.unbanUserButton = page.getByRole('button', { name: /unban/i });
		this.deleteUserButton = page.getByRole('button', { name: /delete user/i });
		this.deleteOrgButton = page.getByRole('button', { name: /delete organization/i });
		this.userDetailsButton = page.getByRole('button', { name: /view details/i });
		this.orgDetailsButton = page.getByRole('button', { name: /view details/i });
		this.refreshButton = page.getByRole('button', { name: /refresh/i });
		this.statsSection = page.locator('[data-testid="stats-section"], .stats-section');
		this.totalUsersCount = page.locator('[data-testid="total-users"], .total-users-count');
		this.totalOrgsCount = page.locator('[data-testid="total-orgs"], .total-orgs-count');
		this.activeUsersCount = page.locator('[data-testid="active-users"], .active-users-count');
		this.bannedUsersCount = page.locator('[data-testid="banned-users"], .banned-users-count');
	}

	async searchUsers(query: string): Promise<void> {
		await this.searchUsersInput.fill(query);

		await this.waitForAPIResponse('/api/v1/admin/users');
	}

	async searchOrganizations(query: string): Promise<void> {
		await this.searchOrgsInput.fill(query);

		await this.waitForAPIResponse('/api/v1/admin/organizations');
	}

	async banUser(userId: string): Promise<void> {
		const userRow = this.getUserRow(userId);
		const banBtn = userRow.locator(this.banUserButton);
		await banBtn.click();

		const confirmButton = this.page.getByRole('button', { name: /confirm/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await this.waitForAPIResponse('/api/v1/admin/user/ban');
	}

	async unbanUser(userId: string): Promise<void> {
		const userRow = this.getUserRow(userId);
		const unbanBtn = userRow.locator(this.unbanUserButton);
		await unbanBtn.click();
		await this.waitForAPIResponse('/api/v1/admin/user/unban');
	}

	async deleteUser(userId: string): Promise<void> {
		const userRow = this.getUserRow(userId);
		const deleteBtn = userRow.locator(this.deleteUserButton);
		await deleteBtn.click();

		const confirmButton = this.page.getByRole('button', { name: /confirm delete/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await this.waitForAPIResponse('/api/v1/admin/user');
	}

	async deleteOrganization(orgId: string): Promise<void> {
		const orgRow = this.getOrgRow(orgId);
		const deleteBtn = orgRow.locator(this.deleteOrgButton);
		await deleteBtn.click();

		const confirmButton = this.page.getByRole('button', { name: /confirm delete/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await this.waitForAPIResponse('/api/v1/admin/organization');
	}

	async viewUserDetails(userId: string): Promise<void> {
		const userRow = this.getUserRow(userId);
		const detailsBtn = userRow.locator(this.userDetailsButton);
		await detailsBtn.click();
		await this.waitForPageLoad();
	}

	async viewOrgDetails(orgId: string): Promise<void> {
		const orgRow = this.getOrgRow(orgId);
		const detailsBtn = orgRow.locator(this.orgDetailsButton);
		await detailsBtn.click();
		await this.waitForPageLoad();
	}

	private getUserRow(userId: string): Locator {
		return this.usersList.locator(`[data-user-id="${userId}"], tr:has([data-user-id="${userId}"])`);
	}

	private getOrgRow(orgId: string): Locator {
		return this.organizationsList.locator(
			`[data-org-id="${orgId}"], tr:has([data-org-id="${orgId}"])`
		);
	}

	async isUserBanned(userId: string): Promise<boolean> {
		const userRow = this.getUserRow(userId);
		const bannedBadge = userRow.locator('[data-testid="banned-badge"], .banned');
		return await bannedBadge.isVisible();
	}

	async getUserCount(): Promise<number> {
		const users = this.usersList.locator('[data-testid="user-row"], tbody tr');
		return await users.count();
	}

	async getOrganizationCount(): Promise<number> {
		const orgs = this.organizationsList.locator('[data-testid="org-row"], tbody tr');
		return await orgs.count();
	}

	async getTotalUsersCount(): Promise<string | null> {
		if (await this.totalUsersCount.isVisible()) {
			return await this.totalUsersCount.textContent();
		}
		return null;
	}

	async getTotalOrgsCount(): Promise<string | null> {
		if (await this.totalOrgsCount.isVisible()) {
			return await this.totalOrgsCount.textContent();
		}
		return null;
	}

	async getActiveUsersCount(): Promise<string | null> {
		if (await this.activeUsersCount.isVisible()) {
			return await this.activeUsersCount.textContent();
		}
		return null;
	}

	async getBannedUsersCount(): Promise<string | null> {
		if (await this.bannedUsersCount.isVisible()) {
			return await this.bannedUsersCount.textContent();
		}
		return null;
	}

	async refreshData(): Promise<void> {
		await this.refreshButton.click();
		await this.waitForAPIResponse('/api/v1/admin/stats');
		await this.waitForPageLoad();
	}

	async isAdminDashboardVisible(): Promise<boolean> {
		return await this.dashboardTitle.isVisible();
	}

	async waitForDataLoad(): Promise<void> {
		await this.waitForElement(this.usersSection);
		await this.waitForElement(this.organizationsSection);
		await this.waitForPageLoad();
	}

	async isStatsVisible(): Promise<boolean> {
		return await this.statsSection.isVisible();
	}
}
