/**
 * A failed save must not replace the speaker's profile with the 500 page (#482).
 *
 * The proposal form (`cfp-save-error.cy.ts`) was wrapped by hand; 32 other forms
 * were not, and this is one of them. It is worth its own browser run because it
 * is the first of that group to be proved: the page is only protected here
 * because `use:enhance` now comes from `$lib/forms/enhance` — nothing on this
 * route was changed.
 *
 * The suite cannot take the database down, so `?/e2eForce500` throws for real
 * behind `ENABLE_TEST_ENDPOINTS`. The form, its enhance and its buttons are the
 * shipped ones; only the button's `formaction` moves.
 *
 * A unit test cannot see this. The failure mode is the page being replaced.
 */
const uniqueSlug = () =>
	`profile-save-error-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A failed profile save', () => {
	it('keeps the typed bio and reports the error on the form', () => {
		const slug = uniqueSlug();
		const bio = 'The bio the 500 used to take with it, along with the rest of the page.';

		cy.createAndLogin().then((speaker) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: speaker.id,
					slug,
					name: 'DevFlow Conf 2028',
					days: ['2028-05-10'],
					sessions: ['Build systems without the wait'],
					speakerUserId: speaker.id
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/portal/profile');
		cy.waitForHydration();

		cy.get('textarea[name="bio"]').clear().type(bio);

		cy.contains('button', 'Save profile').invoke('attr', 'formaction', '?/e2eForce500').click();

		cy.get('[data-testid="error-page"]').should('not.exist');
		cy.contains('h1', 'Something broke').should('not.exist');
		cy.location('pathname').should('eq', '/portal/profile');

		cy.get('[data-testid="form-action-error"]')
			.should('be.visible')
			.and(
				'contain',
				'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.'
			);

		cy.get('textarea[name="bio"]').should('have.value', bio);
	});
});
