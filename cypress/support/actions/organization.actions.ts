/// <reference types="cypress" />
import { OrganizationPage } from '../pages/organization.page';

const organizationPage = new OrganizationPage();

/** Ported from e2e/actions/organization.actions.ts. */
export const OrganizationActions = {
	navigateToOrganizationPage(): void {
		organizationPage.visit();
	},

	createOrganization(name: string): void {
		organizationPage.createOrganization(name);
	},

	verifyOrganizationName(name: string): void {
		organizationPage.shouldHaveName(name);
	},

	inviteUserByEmail(email: string, role: 'member' | 'admin' | 'owner' = 'member'): void {
		organizationPage.inviteMember(email, role);
	},

	verifyInvitationSent(email: string): void {
		cy.contains('td', email, { timeout: 15000 }).should('exist');
	},

	verifyOrganizationMembership(name: string): void {
		organizationPage.shouldHaveName(name);
	},

	transferOwnershipTo(email: string): void {
		organizationPage.changeMemberRole(email, 'owner');
	},

	verifyUserRole(email: string, role: string): void {
		organizationPage.memberRole(email).should('contain.text', capitalize(role));
	},

	leaveOrganization(): void {
		organizationPage.leaveOrganizationButton().click();
	}
};

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
