import { Page, expect } from '@playwright/test';
import { OrganizationPage } from '../pages/organization.page';
import { TestUser, testUserManager } from '../test-user-manager';

export interface OrganizationMember {
	email: string;
	role: 'owner' | 'admin' | 'member';
}

export interface Organization {
	name: string;
	owner: TestUser;
	members?: OrganizationMember[];
}

export class OrganizationActions {
	private page: Page;
	private organizationPage: OrganizationPage;

	constructor(page: Page) {
		this.page = page;
		this.organizationPage = new OrganizationPage(page);
	}

	async navigateToOrganizationPage(): Promise<void> {
		await this.organizationPage.goto();
		await this.organizationPage.waitForPageLoad();
	}

	async createOrganization(name: string): Promise<void> {
		await this.organizationPage.createOrganization(name);
		await this.verifyOrganizationName(name);
	}

	async updateOrganizationSettings(newName: string): Promise<void> {
		await this.organizationPage.updateOrganizationName(newName);
		await this.verifyOrganizationName(newName);
	}

	async updateOrganizationName(newName: string): Promise<void> {
		await this.organizationPage.updateOrganizationName(newName);
		await this.verifyOrganizationName(newName);
	}

	async inviteUser(email: string, role: 'member' | 'admin' = 'member'): Promise<void> {
		await this.organizationPage.inviteMember(email, role);
		await this.verifyInvitePending(email);
	}

	async inviteUserAndGetLink(email: string, role: 'member' | 'admin' = 'member'): Promise<string> {
		await this.organizationPage.inviteMember(email, role);
		await this.verifyInvitePending(email);
		// Get the invitation link from the page
		const inviteLink = await this.organizationPage.getInviteLink(email);
		if (!inviteLink) {
			throw new Error(`Failed to get invite link for ${email}`);
		}
		return inviteLink;
	}

	async inviteMultipleUsers(
		users: Array<{ email: string; role?: 'member' | 'admin' }>
	): Promise<void> {
		for (const user of users) {
			await this.inviteUser(user.email, user.role || 'member');
		}
	}

	async removeUser(email: string): Promise<void> {
		await this.organizationPage.removeMember(email);
		await this.verifyMemberRemoved(email);
	}

	async cancelInvite(email: string): Promise<void> {
		await this.organizationPage.cancelInvite(email);
		await this.verifyInviteCancelled(email);
	}

	async changeMemberRole(email: string, newRole: string): Promise<void> {
		await this.organizationPage.changeMemberRole(email, newRole);
		await this.verifyMemberRole(email, newRole);
	}

	async deleteOrganization(): Promise<void> {
		await this.organizationPage.deleteOrganization();
	}

	async leaveOrganization(): Promise<void> {
		await this.organizationPage.leaveOrganization();
	}

	async verifyOrganizationName(expectedName: string): Promise<void> {
		const name = await this.organizationPage.getOrganizationName();
		expect(name).toContain(expectedName);
	}

	async verifyMemberExists(email: string): Promise<void> {
		const exists = await this.organizationPage.isMemberVisible(email);
		expect(exists, `Member with email "${email}" should exist`).toBeTruthy();
	}

	async verifyMemberRemoved(email: string): Promise<void> {
		const exists = await this.organizationPage.isMemberVisible(email);
		expect(exists, `Member with email "${email}" should not exist`).toBeFalsy();
	}

	async verifyInvitePending(email: string): Promise<void> {
		const pending = await this.organizationPage.isInvitePending(email);
		expect(pending, `Invite for "${email}" should be pending`).toBeTruthy();
	}

	async verifyInviteCancelled(email: string): Promise<void> {
		const pending = await this.organizationPage.isInvitePending(email);
		expect(pending, `Invite for "${email}" should not be pending`).toBeFalsy();
	}

	async verifyMemberRole(email: string, expectedRole: string): Promise<void> {
		const role = await this.organizationPage.getMemberRole(email);
		expect(role).toBe(expectedRole);
	}

	async verifyMemberCount(expectedCount: number): Promise<void> {
		const count = await this.organizationPage.getMemberCount();
		expect(count, `Expected ${expectedCount} members, but found ${count}`).toBe(expectedCount);
	}

	async verifyPendingInviteCount(expectedCount: number): Promise<void> {
		const count = await this.organizationPage.getPendingInviteCount();
		expect(count, `Expected ${expectedCount} pending invites, but found ${count}`).toBe(
			expectedCount
		);
	}

	async verifyIsOwner(): Promise<void> {
		const isOwner = await this.organizationPage.isOwner();
		expect(isOwner, 'User should be organization owner').toBeTruthy();
	}

	async inviteUserByEmail(email: string, role: 'member' | 'admin' = 'member'): Promise<void> {
		// Same as inviteUser but with clearer naming
		await this.inviteUser(email, role);
	}

	async verifyInvitationSent(email: string): Promise<void> {
		// Verify the invitation was sent successfully
		await this.verifyInvitePending(email);
	}

	async acceptPendingInvitation(organizationName: string): Promise<void> {
		// Accept a pending invitation to join an organization
		// This would typically be shown on a dedicated invitations page or dashboard
		const acceptButton = this.page.getByRole('button', { name: /accept/i });
		if (await acceptButton.isVisible({ timeout: 5000 })) {
			await acceptButton.click();
			await this.page.waitForLoadState('networkidle');
		}
		// Verify we're now part of the organization
		await this.verifyOrganizationMembership(organizationName);
	}

	async verifyOrganizationMembership(organizationName: string): Promise<void> {
		// Verify the user is a member of the specified organization
		await this.navigateToOrganizationPage();
		const orgName = await this.organizationPage.getOrganizationName();
		expect(orgName).toContain(organizationName);
	}

	async transferOwnershipTo(memberEmail: string): Promise<void> {
		// Transfer ownership to another member
		await this.organizationPage.transferOwnership(memberEmail);
	}

	async verifyUserRole(email: string, expectedRole: string): Promise<void> {
		// Verify a user's role in the organization
		await this.verifyMemberRole(email, expectedRole);
	}

	async verifyOrganizationOwnership(): Promise<void> {
		// Verify the current user is the owner
		await this.verifyIsOwner();
	}

	async verifyIsMember(): Promise<void> {
		const isMember = await this.organizationPage.isMember();
		expect(isMember, 'User should be organization member').toBeTruthy();
	}

	async createOrganizationWithMembers(
		orgName: string,
		members: Array<{ email: string; role?: 'member' | 'admin' }>
	): Promise<Organization> {
		const owner = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('org-owner'),
			password: 'password123',
			organizationName: orgName
		});

		await this.navigateToOrganizationPage();

		for (const member of members) {
			await this.inviteUser(member.email, member.role || 'member');
		}

		return {
			name: orgName,
			owner,
			members: members.map((m) => ({
				email: m.email,
				role: (m.role || 'member') as 'owner' | 'admin' | 'member'
			}))
		};
	}

	async acceptInvitation(inviteUrl: string): Promise<void> {
		await this.page.goto(inviteUrl);
		const acceptButton = this.page.getByRole('button', { name: /accept/i });
		if (await acceptButton.isVisible()) {
			await acceptButton.click();
			await this.page.waitForNavigation();
		}
	}

	async getMembersList(): Promise<OrganizationMember[]> {
		const members: OrganizationMember[] = [];
		const count = await this.organizationPage.getMemberCount();

		for (let i = 0; i < count; i++) {
			const memberRow = this.page.locator('[data-testid="member-row"], tbody tr').nth(i);
			const email = await memberRow.locator('[data-testid="member-email"]').textContent();
			const role = await memberRow.locator('[data-testid="member-role"]').textContent();

			if (email && role) {
				members.push({
					email,
					role: role.toLowerCase() as 'owner' | 'admin' | 'member'
				});
			}
		}

		return members;
	}

	async waitForMembersLoad(): Promise<void> {
		await this.organizationPage.waitForMembersLoad();
	}

	async verifyOrganizationPageVisible(): Promise<void> {
		const visible = await this.organizationPage.isOrganizationPageVisible();
		expect(visible, 'Organization page should be visible').toBeTruthy();
	}

	async canInviteMembers(): Promise<boolean> {
		// Check if the user has permission to invite members
		// This should check for the presence of invite UI elements
		try {
			await this.organizationPage.goto();
			const inviteButton = this.page.getByRole('button', { name: /Invite Member/i });
			return await inviteButton.isVisible();
		} catch {
			return false;
		}
	}

	async canManageSettings(): Promise<boolean> {
		// Check if the user has permission to manage organization settings
		// This should check for the presence of settings UI elements
		try {
			await this.organizationPage.goto();
			// Check for settings elements that only owners/admins can see
			// Look for the Organization Details section or Leave Organization button
			const leaveOrgButton = this.page.getByRole('button', { name: /Leave Organization/i });
			const orgDetailsSection = this.page.getByText('Organization Details');
			return (await leaveOrgButton.isVisible()) || (await orgDetailsSection.isVisible());
		} catch {
			return false;
		}
	}
}
