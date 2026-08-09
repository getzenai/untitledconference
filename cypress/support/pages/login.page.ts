/// <reference types="cypress" />
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
	readonly path = '/login';

	emailInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="email"]');
	}

	passwordInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="password"]');
	}

	loginButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button[type="submit"]', /^Login$/);
	}

	rememberMeCheckbox(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[role="checkbox"]');
	}

	registerLink(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('a[href="/register"]');
	}

	login(email: string, password: string, rememberMe?: boolean): this {
		this.emailInput().clear().type(email);
		this.passwordInput().clear().type(password, { log: false });
		if (rememberMe !== undefined) {
			this.rememberMeCheckbox().then(($el) => {
				const checked = $el.attr('data-state') === 'checked';
				if (checked !== rememberMe) {
					cy.wrap($el).click();
				}
			});
		}
		this.loginButton().click();
		return this;
	}

	loginAndWaitForRedirect(email: string, password: string, expectedUrl = '/home'): this {
		this.login(email, password);
		cy.url({ timeout: 20000 }).should('include', expectedUrl);
		return this;
	}

	submitEmptyForm(): this {
		this.emailInput().clear();
		this.passwordInput().clear();
		this.loginButton().click();
		return this;
	}

	clickRegisterLink(): this {
		this.registerLink().click();
		return this;
	}
}
