/**
 * A failed submit must not replace the public call with the 500 page (#482).
 *
 * The worst instance in the app: a speaker types title, abstract, bio — no
 * draft, no way back. `use:enhance` without a wrapper applies `type: 'error'`
 * like a failed navigation, and `+error.svelte` takes the text with it.
 *
 * The suite cannot take the database down, so the call's `e2eForce500` action
 * throws for real, gated by `ENABLE_TEST_ENDPOINTS`. The POST is a genuine
 * action 500; Cypress does not invent the response.
 *
 * A unit test cannot see this. The failure mode is the page being replaced.
 */
const uniqueSlug = () => `cfp-save-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A failed proposal submit', () => {
	it('keeps the typed abstract and reports the error on the form', () => {
		const slug = uniqueSlug();
		const abstract = 'The queue used to drop this paragraph the moment the save threw.';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/settings`);
		cy.waitForHydration();
		cy.get('[data-testid="settings-visibility"] [data-testid="visibility-submit"]').click();
		cy.get('[data-testid="visibility-state"]', { timeout: 20000 }).should('contain.text', 'Live');

		cy.visit(`/manage/${slug}/cfp`);
		cy.waitForHydration();
		cy.contains('button', 'Create the call for papers').click();
		cy.get('[data-testid="cfp-publish"]').click();
		cy.get('[data-testid="cfp-live-banner"]', { timeout: 20000 }).should('exist');

		cy.logout();

		cy.createAndLogin().then((speaker) => {
			cy.visit(`/c/${slug}/cfp`);
			cy.waitForHydration();

			cy.get('input[name="title"]').clear().type('What the save must not throw away');
			cy.get('textarea[name="abstract"]').clear().type(abstract);
			cy.get('input[name="speakerName"]').clear().type('Ada Bennett');
			cy.get('input[name="speakerEmail"]').clear().type(speaker.email);

			// Same form, same `use:enhance`. Only the button's action changes —
			// that is how the suite provokes the 500 without inventing the response.
			cy.contains('button', 'Submit proposal')
				.invoke('attr', 'formaction', '?/e2eForce500')
				.click();

			cy.get('[data-testid="error-page"]').should('not.exist');
			cy.contains('h1', 'Something broke').should('not.exist');
			cy.location('pathname').should('eq', `/c/${slug}/cfp`);

			cy.get('[data-testid="form-action-error"]')
				.should('be.visible')
				.and(
					'contain',
					'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
				);

			cy.get('textarea[name="abstract"]').should('have.value', abstract);
			cy.contains('button', 'Submit proposal').should('not.be.disabled');
		});
	});
});
