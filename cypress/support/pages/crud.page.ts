/// <reference types="cypress" />
import { BasePage } from './base.page';

/** Detail page for a single example object: /examples/crud/[id]. */
export class CrudDetailPage extends BasePage {
	readonly path = '/examples/crud';

	nameInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="name"]');
	}

	descriptionInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('textarea[name="description"]');
	}

	saveButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button[type="submit"]', /Save Changes/i);
	}

	deleteTrigger(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button', /^\s*Delete\s*$/);
	}

	confirmDeleteButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button', /Delete Forever/i);
	}

	update(name: string, description: string): this {
		this.nameInput().clear().type(name).should('have.value', name);
		this.descriptionInput().clear().type(description).should('have.value', description);
		this.saveButton().click();
		return this;
	}

	deleteObject(): this {
		this.deleteTrigger().click();
		this.confirmDeleteButton().click();
		return this;
	}
}

export class CrudPage extends BasePage {
	readonly path = '/examples/crud';

	nameInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('input[name="name"]');
	}

	descriptionInput(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('textarea[name="description"]');
	}

	createButton(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.contains('button[type="submit"]', /Create Object/i);
	}

	itemNames(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[data-testid="example-name"]');
	}

	/** The card that contains an item with the exact given name. */
	itemCard(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy
			.contains('[data-testid="example-name"]', new RegExp(`^${escapeText(name)}$`))
			.closest('[data-slot="card"]');
	}

	createItem(name: string, description: string): this {
		this.nameInput().clear().type(name);
		this.descriptionInput().clear().type(description);
		this.createButton().click();
		// The list is re-rendered from the server action's returned data.
		this.shouldHaveItem(name);
		return this;
	}

	openItem(name: string): CrudDetailPage {
		this.itemCard(name).find('a[href^="/examples/crud/"]').click();
		const detail = new CrudDetailPage();
		detail.waitForPageLoad();
		cy.url().should('match', /\/examples\/crud\/\d+/);
		return detail;
	}

	shouldHaveItem(name: string): this {
		cy.contains('[data-testid="example-name"]', new RegExp(`^${escapeText(name)}$`), {
			timeout: 15000
		}).should('exist');
		return this;
	}

	/**
	 * Exact-match absence check. A substring check on the page text would be
	 * wrong twice over: "X" is a substring of "Updated X", and SvelteKit inlines
	 * the whole page payload (including item names) into a <script> in <body>.
	 */
	shouldNotHaveItem(name: string): this {
		cy.get('body').should(($body) => {
			const names = $body
				.find('[data-testid="example-name"]')
				.toArray()
				.map((el) => el.textContent?.trim());
			expect(names).to.not.include(name);
		});
		return this;
	}

	shouldShowEmptyState(): this {
		cy.contains('No example objects found').should('be.visible');
		return this;
	}

	itemCount(): Cypress.Chainable<number> {
		return cy.get('body').then(($body) => $body.find('[data-testid="example-name"]').length);
	}

	formShouldBeEmpty(): this {
		this.nameInput().should('have.value', '');
		this.descriptionInput().should('have.value', '');
		return this;
	}

	submitEmptyForm(): this {
		this.nameInput().clear();
		this.descriptionInput().clear();
		this.createButton().click();
		return this;
	}
}

function escapeText(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
