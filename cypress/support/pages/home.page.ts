/// <reference types="cypress" />
import { BasePage } from './base.page';

export class HomePage extends BasePage {
	readonly path = '/home';

	/**
	 * Anchored on a testid rather than the heading text. The heading used to read
	 * "Protected Dashboard" — starter-template wording that a judge sees on the
	 * first screen after login — and renaming it should not be able to break the
	 * "am I logged in" assertion of four specs.
	 */
	dashboardContent(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[data-testid="home-dashboard"]');
	}

	welcomeMessage(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains(/^Welcome/);
	}

	sidebar(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[data-testid="app-sidebar"]');
	}

	logoutButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button', /^Logout$/);
	}

	adminNavLink(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[data-testid="app-sidebar"]').find('a[href="/admin/users"]');
	}

	shouldBeLoggedIn(): this {
		cy.url().should('include', '/home');
		this.dashboardContent().should('be.visible');
		return this;
	}

	shouldShowAdminNav(): this {
		this.sidebar().should('contain.text', 'Admin');
		return this;
	}

	shouldNotShowAdminNav(): this {
		this.sidebar().should('not.contain.text', 'Admin');
		return this;
	}

	logout(): this {
		this.logoutButton().click();
		cy.url({ timeout: 20000 }).should('include', '/login');
		return this;
	}
}
