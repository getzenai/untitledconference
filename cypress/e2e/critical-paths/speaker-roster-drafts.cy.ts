/**
 * Speaker roster drafts: the open row survives reload, and the add dialog
 * survives Escape without a question. Reopening and then reloading
 * distinguishes a browser draft from a value that merely stayed alive in
 * the old component.
 */
const uniqueSlug = () => `spk-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Speaker roster drafts', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();
		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);

			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/manage/${slug}/speakers?/add`,
				form: true,
				headers: { Origin: Cypress.config('baseUrl') as string },
				body: { name: 'Priya Raman', email: `priya-${slug}@example.test`, status: 'invited' }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps a typed row name through a reload', () => {
		const name = `ORGJOURNEY row-${Date.now()}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-name"]').clear().type(name);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speaker-edit-toggle"]').click();
		cy.get('[data-testid="edit-name"]').should('have.value', name);
		cy.get('[data-testid="edit-name-restored"]').should('be.visible');
	});

	it('keeps the typed add-speaker name after Escape, reopen, and reload, then clears on add', () => {
		const stamp = Date.now();
		const name = `ORGJOURNEY add-${stamp}`;
		const email = `add-${stamp}@example.test`;
		const company = `Acme-${stamp}`;

		cy.visit(`/manage/${slug}/speakers`);
		cy.waitForHydration();
		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').type(name);
		cy.get('[data-testid="add-email"]').type(email);
		cy.get('[data-testid="add-company"]').type(company);

		const asked: string[] = [];
		cy.on('window:confirm', (text) => {
			asked.push(text);
			return true;
		});
		cy.get('[data-testid="add-name"]').type('{esc}');
		cy.get('[data-testid="speakers-add-dialog"]').should('not.exist');
		cy.wrap(asked).should('have.length', 0);

		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', name);
		cy.get('[data-testid="add-email"]').should('have.value', email);
		cy.get('[data-testid="add-company"]').should('have.value', company);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', name);
		cy.get('[data-testid="add-email"]').should('have.value', email);
		cy.get('[data-testid="add-company"]').should('have.value', company);
		cy.get('[data-testid="add-name-restored"]').should('be.visible');

		cy.get('[data-testid="add-submit"]').click();
		cy.get('[data-testid="speakers-add-dialog"]').should('not.exist');
		cy.contains('Speaker added to the roster.').should('be.visible');

		cy.get('[data-testid="speakers-add"]').click();
		cy.get('[data-testid="add-name"]').should('have.value', '');
		cy.get('[data-testid="add-email"]').should('have.value', '');
		cy.get('[data-testid="add-company"]').should('have.value', '');
	});
});
