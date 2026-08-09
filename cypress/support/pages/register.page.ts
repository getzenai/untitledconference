/// <reference types="cypress" />
import { BasePage } from './base.page';

/**
 * The registration form only has email + password. The Playwright page object
 * also carried "Confirm Password" and "Organization Name" locators, but neither
 * field exists in src/routes/(public)/register/+page.svelte - which is why the
 * specs that used them were permanently `test.fixme`. They are not ported.
 */
export class RegisterPage extends BasePage {
	readonly path = '/register';

	emailInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="email"]');
	}

	passwordInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="password"]');
	}

	registerButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button[type="submit"]', /^Register$/);
	}

	loginLink(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('a[href="/login"]');
	}

	register(email: string, password: string): this {
		this.emailInput().clear().type(email);
		this.passwordInput().clear().type(password, { log: false });
		this.registerButton().click();
		return this;
	}

	registerAndWaitForRedirect(email: string, password: string, expectedUrl = '/home'): this {
		this.register(email, password);
		cy.url({ timeout: 20000 }).should('include', expectedUrl);
		return this;
	}

	clickLoginLink(): this {
		this.loginLink().click();
		return this;
	}
}
