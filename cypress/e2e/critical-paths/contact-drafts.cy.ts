/**
 * Three contact-side fields that used to swallow what was typed into them
 * (#763, #764, #765).
 *
 * Each one fails in a different way, which is why this is three cases rather
 * than one loop: the add-contact dialog dies on Escape, which is not a
 * navigation at all; the reviewer invite dies on a sidebar click; the contact
 * notes die on leaving the page. A unit test sees none of it — the draft only
 * exists in a real browser's `localStorage`, and the whole claim is about what
 * survives leaving.
 *
 * Every case asserts on the value coming *back*, never on a save. Pressing the
 * form's own button would prove the server works, which was never in doubt.
 */
const uniqueSlug = () => `contact-drafts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Typed contact details survive leaving', () => {
	it('keeps the add-contact dialog after Escape and after a reload', () => {
		const name = `Draft Person ${Date.now()}`;
		const company = 'Northwind Labs';

		cy.createAndLogin();
		cy.visit('/contacts');
		cy.waitForHydration();

		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').type(name);
		cy.get('[data-testid="contacts-add-company"]').type(company);

		// Escape is an explicit dismiss, not a navigation — `beforeNavigate`
		// never fires, so only the draft can carry this.
		cy.get('body').type('{esc}');
		cy.get('[data-testid="contacts-add"]').should('not.exist');

		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').should('have.value', name);
		cy.get('[data-testid="contacts-add-company"]').should('have.value', company);

		// And across a reload, which the dialog's own state cannot survive.
		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').should('have.value', name);
	});

	it('keeps a half-typed reviewer invite across a reload', () => {
		const slug = uniqueSlug();
		const email = `invited-${Date.now()}@example.test`;

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/people`);
		cy.waitForHydration();
		cy.get('[data-testid="reviewer-invite-email"]').type(email);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="reviewer-invite-email"]').should('have.value', email);
	});

	it('keeps typed contact notes across a reload', () => {
		const notes = `ORGJOURNEY notes ${Date.now()}`;

		cy.createAndLogin();
		cy.visit('/contacts');
		cy.waitForHydration();

		// Make a contact to own the notes, through the dialog it already tests.
		cy.get('[data-testid="contacts-add-open"]').click();
		cy.get('[data-testid="contacts-add-name"]').clear();
		cy.get('[data-testid="contacts-add-name"]').type(`Notes Owner ${Date.now()}`);
		cy.get('[data-testid="contacts-add-submit"]').click();
		cy.get('[data-testid="contacts-add"]', { timeout: 20000 }).should('not.exist');

		cy.contains('a', 'Notes Owner').click();
		cy.waitForHydration();
		cy.get('[data-testid="contact-notes"]').type(notes);

		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="contact-notes"]').should('have.value', notes);
	});
});
