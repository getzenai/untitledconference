/**
 * A failed Save must not replace the settings page with the 500 page (#462).
 *
 * The bug was confirmed with a real outage (`docker stop` on the database), not
 * a simulated status. The suite cannot take the database down — every other
 * spec would 500 with it — so the settings action `e2eForce500` throws for
 * real, gated by `ENABLE_TEST_ENDPOINTS`. The POST is a genuine action 500;
 * Cypress does not intercept the response.
 *
 * A broken *route* must still render `+error.svelte`. That is `error-page.cy.ts`.
 */
const uniqueSlug = () => `save-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A failed settings save', () => {
	let slug: string;

	beforeEach(() => {
		slug = uniqueSlug();

		cy.createAndLogin().then((user) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: user.id, slug, days: ['2028-05-10'], sessions: ['Fixture Talk A'] }
			})
				.its('status')
				.should('eq', 200);
		});
	});

	it('keeps what was typed and reports the error on the form', () => {
		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();

		const field = () => cy.get('[data-testid="settings-rooms"] textarea[name="names"]');
		field().clear().type('Hall 1{enter}');
		cy.get('[data-testid="settings-room-row"]').should('have.length', 1);

		const typed = 'Hall One — keep me';
		const row = () => cy.get('[data-testid="settings-room-row"][data-name="Hall 1"]');

		row().within(() => {
			cy.get('input[name="name"]').clear().type(typed);
			// Same form, same `use:enhance`. Only the button's action changes —
			// that is how the suite provokes the 500 without inventing the response.
			cy.contains('button', 'Save').invoke('attr', 'formaction', '?/e2eForce500').click();
		});

		cy.get('[data-testid="error-page"]').should('not.exist');
		cy.contains('h1', 'Something broke').should('not.exist');
		cy.location('pathname').should('eq', `/manage/${slug}/settings`);

		cy.get('[data-testid="form-action-error"]')
			.should('be.visible')
			.and(
				'contain',
				'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
			);

		row().find('input[name="name"]').should('have.value', typed);
		row().contains('button', 'Save').should('not.be.disabled');
	});
});
