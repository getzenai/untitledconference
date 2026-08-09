/// <reference types="cypress" />
import { BasePage } from './base.page';

/**
 * Organization settings.
 *
 * /settings/organization is a redirect: to /settings/organization/[slug] when
 * the user has an active org, otherwise to /settings/organization/new.
 */
export class OrganizationPage extends BasePage {
	readonly path = '/settings/organization';
	readonly newPath = '/settings/organization/new';

	visitNew(): this {
		cy.visit(this.newPath);
		this.waitForPageLoad();
		return this;
	}

	organizationNameInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('#orgName');
	}

	createOrganizationButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button', /Create Organization/i);
	}

	inviteEmailInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="email"]');
	}

	inviteRoleTrigger(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('#inviteRole');
	}

	inviteButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button[type="submit"]', /Invite|Send/i);
	}

	leaveOrganizationButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button', /Leave Organization/i);
	}

	memberRow(email: string): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('tr', email);
	}

	title(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('h1');
	}

	shouldShowOrganizationPage(): this {
		cy.url().should('include', '/settings/organization');
		cy.get('h1').should('be.visible');
		return this;
	}

	shouldHaveName(name: string): this {
		cy.get('h1').should('contain.text', name);
		return this;
	}

	createOrganization(name: string): this {
		this.visitNew();
		this.organizationNameInput().clear().type(name);
		this.createOrganizationButton().click();
		cy.url({ timeout: 20000 }).should('match', /\/settings\/organization\/[^/]+$/);
		cy.url().should('not.include', '/new');
		return this;
	}

	inviteMember(email: string, role: 'member' | 'admin' | 'owner' = 'member'): this {
		this.inviteEmailInput().clear().type(email);
		this.inviteRoleTrigger().click();
		cy.get(`[role="option"][data-value="${role}"]`).click();
		this.inviteButton().click();
		return this;
	}

	shouldHaveMember(email: string): this {
		cy.contains('tr', email, { timeout: 15000 }).should('exist');
		return this;
	}

	memberRole(email: string): Cypress.Chainable<JQuery<HTMLElement>> {
		return this.memberRow(email).find('[data-testid="member-role"]');
	}

	changeMemberRole(email: string, role: 'member' | 'admin' | 'owner'): this {
		this.memberRow(email).find('[data-testid="member-role"]').click();
		cy.get(`[role="option"][data-value="${role}"]`).click();
		return this;
	}

	/** Invitation id of a pending invite, read out of the hidden form input in its row. */
	invitationId(email: string): Cypress.Chainable<string> {
		return cy
			.contains('tr', email)
			.find('input[name="invitationId"]')
			.first()
			.invoke('attr', 'value')
			.then((value) => {
				if (!value) {
					throw new Error(`No invitationId found for ${email}`);
				}
				return cy.wrap(value);
			});
	}
}
