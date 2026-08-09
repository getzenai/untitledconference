/// <reference types="cypress" />
import { BasePage } from '../base.page';

/**
 * System admin dashboard.
 *
 * The Playwright page object pointed at `/admin`, which does not exist in this
 * app (it 404s). The real dashboard lives at /admin/users and is guarded by
 * src/routes/(admin)/+layout.server.ts.
 */
export class AdminDashboardPage extends BasePage {
	readonly path = '/admin/users';

	dashboardTitle(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('h1', /System Admin Dashboard/i);
	}

	searchInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('#search');
	}

	usersTable(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('table').first();
	}

	userRow(email: string): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('tbody tr', email);
	}

	shouldBeVisible(): this {
		this.dashboardTitle().should('be.visible');
		return this;
	}

	searchUsers(query: string): this {
		this.searchInput().clear().type(query);
		return this;
	}

	userCount(): Cypress.Chainable<number> {
		return this.usersTable()
			.find('tbody tr')
			.then(($rows) => $rows.length);
	}

	shouldListUser(email: string): this {
		this.usersTable().should('contain.text', email);
		return this;
	}
}
