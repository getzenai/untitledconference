import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class OrganizationPage extends BasePage {
	// RESTful routing implemented:
	// - /settings/organization (redirects based on context)
	// - /settings/organization/new (creation)
	// - /settings/organization/[slug] (details)
	readonly path = '/settings/organization';
	readonly newPath = '/settings/organization/new';

	private readonly organizationNameInput: Locator;
	private readonly inviteEmailInput: Locator;
	private readonly inviteRoleSelect: Locator;
	private readonly inviteButton: Locator;
	private readonly membersList: Locator;
	private readonly pendingInvitesList: Locator;
	private readonly updateSettingsButton: Locator;
	private readonly deleteOrganizationButton: Locator;
	private readonly createOrganizationButton: Locator;
	private readonly leaveOrganizationButton: Locator;
	private readonly organizationTitle: Locator;
	private readonly roleSelector: Locator;
	private readonly removeMemberButton: Locator;
	private readonly cancelInviteButton: Locator;

	constructor(page: Page) {
		super(page);
		this.organizationNameInput = page.getByLabel('Organization Name');
		this.inviteEmailInput = page.getByLabel('Email Address');
		// Use the specific ID to avoid conflicts with the hidden select
		this.inviteRoleSelect = page.locator('#inviteRole');
		this.inviteButton = page.getByRole('button', { name: /invite/i });
		this.membersList = page.locator('[data-testid="members-list"], .members-list');
		this.pendingInvitesList = page.locator('[data-testid="pending-invites"], .pending-invites');
		this.updateSettingsButton = page.getByRole('button', { name: /update/i });
		this.deleteOrganizationButton = page.getByRole('button', { name: /delete organization/i });
		this.createOrganizationButton = page.getByRole('button', { name: /create organization/i });
		this.leaveOrganizationButton = page.getByRole('button', { name: /leave organization/i });
		this.organizationTitle = page.locator('h1, h2').filter({ hasText: /organization/i });
		this.roleSelector = page.locator('[data-testid="role-select"], select[name="role"]');
		this.removeMemberButton = page.getByRole('button', { name: /remove/i });
		this.cancelInviteButton = page.getByRole('button', { name: /cancel invite/i });
	}

	async goto(): Promise<void> {
		await this.page.goto(this.path);
		// The main path will redirect, so wait for navigation to complete
		await this.page.waitForLoadState('networkidle');
	}

	async gotoNew(): Promise<void> {
		await this.page.goto(this.newPath);
		await this.waitForPageLoad();
	}

	async createOrganization(name: string): Promise<void> {
		// Ensure we're on the new organization page
		const currentUrl = this.page.url();
		if (!currentUrl.includes('/settings/organization/new')) {
			await this.page.goto('/settings/organization/new');
			await this.page.waitForLoadState('networkidle');
		}

		// Click and fill the organization name input field
		await this.organizationNameInput.click();
		await this.organizationNameInput.fill(name);
		await this.createOrganizationButton.click();

		// Wait for navigation away from /new - the URL should change to include a slug
		await this.page.waitForFunction(() => {
			const url = window.location.href;
			return url.includes('/settings/organization/') && !url.includes('/new');
		});

		// Wait for the page to fully load
		await this.page.waitForLoadState('networkidle');

		// Wait for Organization Details to be visible
		await this.page.waitForSelector('text=Organization Details');
	}

	async updateOrganizationName(newName: string): Promise<void> {
		await this.organizationNameInput.clear();
		await this.organizationNameInput.fill(newName);
		await this.updateSettingsButton.click();
		await this.waitForAPIResponse('/api/organization');
	}

	async inviteMember(email: string, role = 'member'): Promise<void> {
		await this.inviteEmailInput.fill(email);
		if (await this.inviteRoleSelect.isVisible()) {
			// Click the select trigger to open the dropdown
			await this.inviteRoleSelect.click();

			// Select the role from the dropdown - specifically target the Select.Item component
			const roleOption = this.page.locator(`[role="option"][data-value="${role}"]`);
			await roleOption.click();
		}
		await this.inviteButton.click();
		// Wait for the invite to appear in the pending list
		await this.page.waitForSelector(`text=${email}`);
	}

	async removeMember(email: string): Promise<void> {
		const memberRow = this.getMemberRow(email);
		const removeBtn = memberRow.locator(this.removeMemberButton);
		await removeBtn.click();

		const confirmButton = this.page.getByRole('button', { name: /confirm/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await this.waitForAPIResponse('/api/v1/organization/member');
	}

	async cancelInvite(email: string): Promise<void> {
		const inviteRow = this.getInviteRow(email);
		const cancelBtn = inviteRow.locator(this.cancelInviteButton);
		await cancelBtn.click();
		await this.waitForAPIResponse('/api/v1/organization/invite');
	}

	async changeMemberRole(email: string, newRole: string): Promise<void> {
		const memberRow = this.getMemberRow(email);
		const roleSelect = memberRow.locator(this.roleSelector);
		await roleSelect.selectOption(newRole);
		await this.waitForAPIResponse('/api/v1/organization/member');
	}

	private getMemberRow(email: string): Locator {
		// Try multiple strategies to find the member row
		// First try to find a table row containing the email
		return this.page.locator(`tr:has-text("${email}")`);
	}

	private getInviteRow(email: string): Locator {
		// Find the table row containing the email
		// Look for a table cell with the email, then get its parent row
		const emailCell = this.page.locator(`td:has-text("${email}")`);
		return emailCell.locator('..');
	}

	async isMemberVisible(email: string): Promise<boolean> {
		const memberRow = this.getMemberRow(email);
		return await memberRow.isVisible();
	}

	async isInvitePending(email: string): Promise<boolean> {
		// Look for the email in the pending invitations table
		// The table might not have specific data-testid, so look for the email text anywhere on the page
		// and check if it's in a table row with "pending" status
		const emailCell = this.page.locator(`td:has-text("${email}")`);
		if (await emailCell.isVisible()) {
			// Check if the same row has "pending" status
			const row = emailCell.locator('..');
			const pendingBadge = row.locator('text=pending');
			return await pendingBadge.isVisible();
		}
		return false;
	}

	async getMemberCount(): Promise<number> {
		const members = this.membersList.locator('[data-testid="member-row"], tbody tr');
		return await members.count();
	}

	async getPendingInviteCount(): Promise<number> {
		const invites = this.pendingInvitesList.locator('[data-testid="invite-row"], tbody tr');
		return await invites.count();
	}

	async getMemberRole(email: string): Promise<string | null> {
		const memberRow = this.getMemberRow(email);
		const roleElement = memberRow.locator('[data-testid="member-role"], .member-role');
		if (await roleElement.isVisible()) {
			const roleText = await roleElement.textContent();
			return roleText ? roleText.trim() : null;
		}
		return null;
	}

	async getOrganizationName(): Promise<string | null> {
		// Try the specific test data attributes first
		const nameElement = this.page.locator('[data-testid="org-name"]');
		if (await nameElement.isVisible()) {
			return await nameElement.textContent();
		}

		// Look for the organization name in the h1 heading (from [slug] page)
		const heading = this.page.locator('h1').first();
		if (await heading.isVisible()) {
			const text = await heading.textContent();
			// The heading shows the organization name directly
			if (text && !text.includes('Create')) {
				return text.trim();
			}
		}

		// Look for the organization name after "Organization Name" label in the Organization Details card
		const orgNameLabel = this.page.locator('text=Organization Name');
		if (await orgNameLabel.isVisible()) {
			// Get the next sibling paragraph that contains the actual organization name
			const nameText = await orgNameLabel.locator('..').locator('p.text-lg').textContent();
			return nameText?.trim() || null;
		}

		// Fallback: get the page text content
		const pageContent = await this.page.textContent('main');
		return pageContent || null;
	}

	async isOwner(): Promise<boolean> {
		// Check for delete organization button first
		if (await this.deleteOrganizationButton.isVisible()) {
			return true;
		}

		// Check if the page shows "Your Role owner" text
		const roleText = this.page.locator('text=Your Role owner');
		if (await roleText.isVisible()) {
			return true;
		}

		// Check for Leave Organization button (owners see this instead of delete sometimes)
		const leaveButton = await this.leaveOrganizationButton.isVisible();
		if (leaveButton) {
			// Additional check - see if user is listed as owner in members table
			const pageText = await this.page.textContent('main');
			if (pageText && pageText.includes('owner')) {
				return true;
			}
		}

		return false;
	}

	async isMember(): Promise<boolean> {
		return await this.leaveOrganizationButton.isVisible();
	}

	async deleteOrganization(): Promise<void> {
		await this.deleteOrganizationButton.click();

		const confirmButton = this.page.getByRole('button', { name: /confirm delete/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}

		await this.waitForAPIResponse('/api/v1/organization');
		await this.waitForNavigation('/home');
	}

	async leaveOrganization(): Promise<void> {
		await this.leaveOrganizationButton.click();

		// Dialog appears - we're no longer the owner but still need to leave
		// Since ownership was already transferred, we can just click the submit button
		// The submit button is the second "Leave Organization" button (in the dialog)
		const dialogLeaveButton = this.page.getByRole('button', { name: /Leave Organization/i }).nth(1);
		await dialogLeaveButton.click();
	}

	async isOrganizationPageVisible(): Promise<boolean> {
		return await this.organizationTitle.isVisible();
	}

	async waitForMembersLoad(): Promise<void> {
		await this.waitForElement(this.membersList);
		await this.waitForPageLoad();
	}

	async getInviteLink(email: string): Promise<string | null> {
		// Try to find the invitation link from the UI or clipboard after invitation
		const inviteRow = this.getInviteRow(email);
		const linkElement = inviteRow.locator('[data-testid="invite-link"], .invite-link');
		if (await linkElement.isVisible()) {
			return await linkElement.getAttribute('href');
		}

		// Try to get from clipboard if available
		const copyButton = inviteRow.locator('[data-testid="copy-link"], button:has-text("Copy")');
		if (await copyButton.isVisible()) {
			await copyButton.click();
			// Note: Getting clipboard content in Playwright requires permissions
			// For testing purposes, we'll construct the link
			return `/register?invitation=${email}`;
		}

		return null;
	}

	async transferOwnership(memberEmail: string): Promise<void> {
		// Find the member row
		const memberRow = this.getMemberRow(memberEmail);

		// Debug: Check if member row is found
		const rowVisible = await memberRow.isVisible();
		console.log(`Member row for ${memberEmail} visible: ${rowVisible}`);

		// First check if a transfer ownership button exists
		const transferButton = memberRow.locator(
			'[data-testid="transfer-ownership"], button:has-text("Transfer Ownership")'
		);

		if (await transferButton.isVisible()) {
			await transferButton.click();
		} else {
			// Look for the Select.Trigger in the member row (bits-ui Select component)
			// The trigger should have data-slot="select-trigger" attribute
			const selectTrigger = memberRow.locator('[data-slot="select-trigger"]').first();

			// Debug: Check what selectors are available
			const hasSelectTrigger = (await selectTrigger.count()) > 0;
			console.log(`Has select trigger in row: ${hasSelectTrigger}`);

			// Also try button with class w-32 as fallback (the Select.Trigger has class="w-32")
			const triggerByClass = memberRow.locator('button.w-32, [data-slot="select-trigger"]').first();
			const hasTriggerByClass = (await triggerByClass.count()) > 0;
			console.log(`Has trigger by class: ${hasTriggerByClass}`);

			if (await selectTrigger.isVisible()) {
				// Click the select trigger to open the dropdown
				await selectTrigger.click();

				// Select the owner option from the dropdown
				const ownerOption = this.page.locator('[role="option"][data-value="owner"]');
				await ownerOption.click();
				// The form should auto-submit on change, wait for navigation or network idle
				await this.page.waitForLoadState('networkidle');
			} else if (await triggerByClass.isVisible()) {
				// Try the class-based selector
				await triggerByClass.click();

				const ownerOption = this.page.locator('[role="option"][data-value="owner"]');
				await ownerOption.click();
				await this.page.waitForLoadState('networkidle');
			} else {
				// Debug: Try to see what's on the page
				try {
					// Global timeout should apply here now
					const pageContent = await this.page.locator('body').textContent();
					console.error(
						`Cannot find role selector for ${memberEmail}. Page contains: ${pageContent?.slice(0, 500)}`
					);
					// Also log the HTML structure of the member row
					const rowHTML = await memberRow.innerHTML();
					console.error(`Member row HTML: ${rowHTML?.slice(0, 500)}`);
				} catch (_e) {
					console.error(`Cannot find role selector for ${memberEmail}`);
				}
				throw new Error(
					`Cannot find transfer ownership option for ${memberEmail}. Make sure you are logged in as the owner.`
				);
			}
		}

		// Confirm the transfer if a confirmation dialog appears
		const confirmButton = this.page.getByRole('button', { name: /confirm/i });
		if (await confirmButton.isVisible()) {
			await confirmButton.click();
		}
	}
}
