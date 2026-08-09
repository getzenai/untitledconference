/// <reference types="cypress" />

/**
 * Base page object.
 *
 * Cypress commands are queued rather than awaited, so page objects here are
 * plain classes whose getters return chainables and whose actions enqueue
 * commands. Same structure as the Playwright page objects, no async/await.
 */
export abstract class BasePage {
	abstract readonly path: string;

	visit(): this {
		cy.visit(this.path);
		this.waitForPageLoad();
		return this;
	}

	/**
	 * Playwright waited for `networkidle`; the Cypress equivalent that actually
	 * matters is "Svelte has hydrated", because everything else retries anyway.
	 */
	waitForPageLoad(): this {
		cy.waitForHydration();
		return this;
	}

	shouldBeOnPage(): this {
		cy.url().should('include', this.path);
		return this;
	}

	errorMessage(): Cypress.Chainable<JQuery<HTMLElement>> {
		return cy.get('[role="alert"], .error-message, .text-destructive').first();
	}

	shouldShowError(text?: string | RegExp): this {
		const alert = cy.get('[role="alert"]', { timeout: 10000 }).first();
		if (text === undefined) {
			alert.should('be.visible');
		} else {
			alert.should('be.visible').invoke('text').should('match', toRegExp(text));
		}
		return this;
	}

	reload(): this {
		cy.reload();
		this.waitForPageLoad();
		return this;
	}
}

export function toRegExp(value: string | RegExp): RegExp {
	return typeof value === 'string' ? new RegExp(escapeRegExp(value), 'i') : value;
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
