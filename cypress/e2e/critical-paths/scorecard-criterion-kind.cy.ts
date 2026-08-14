/**
 * The scorecard's "Type" dropdown, in a browser (#167).
 *
 * This control is the app's own dropdown now, and the swap is only safe if two
 * things survive it, neither of which a server render can see:
 *
 *  1. **The disclosure still fires.** "Rating" shows a scale, "Select" shows an
 *     options box. A native `<select>` announced its pick with a bubbling
 *     `change`; an app select sets a hidden input and calls `onValueChange`
 *     instead, so a page that listened for the event goes quietly dead. The
 *     markup looks identical either way.
 *  2. **The pick reaches the action.** bits-ui runs `onValueChange` from inside
 *     its own value setter, before Svelte has written the hidden input — a form
 *     submitted from that callback posts the *previous* value. This form
 *     submits from a button, not from the callback, and that is what the save
 *     below is checking.
 *
 * Both were shipped as real defects by #164 on other screens, which is why this
 * spec exists rather than an SSR pin on the markup.
 */
const uniqueSlug = () => `criterion-kind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The scorecard criterion type', () => {
	it('discloses the options box when the type is switched, and saves what was picked', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: { userId: organizer.id, slug, days: ['2028-05-10'], sessions: [] }
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit(`/manage/${slug}/rounds`);
		cy.waitForHydration();

		cy.get('form[action="?/add"] input[name="name"]').type('Screening');
		cy.get('form[action="?/add"] button[type="submit"]').click();
		// The round form is `use:enhance`, so no document is replaced here — the
		// criterion form appears in the page that already hydrated above, and its
		// app selects are live as soon as it renders.
		cy.get('[data-testid="add-criterion"]').should('exist');

		// Rating is the default, and its scale is what the organizer sees first.
		cy.get('[data-testid="add-criterion-scale-max"]').should('exist');
		cy.get('[data-testid="add-criterion-kind"]').should('contain.text', 'Rating');

		cy.chooseFromAppSelect('add-criterion-kind', 'Select');

		// The disclosure. If the swap had broken the `change` path this is where
		// it shows: the trigger would read "Select" and the form would still be
		// asking for a scale.
		cy.get('[data-testid="add-criterion-scale-max"]').should('not.exist');
		cy.get('textarea[name="options"]').should('be.visible').type('Strong yes\nMaybe\nNo');

		cy.get('[data-testid="add-criterion-label"]').type('Fit');
		cy.get('[data-testid="add-criterion"] button[type="submit"]').click();

		// Saved as a select, not as the rating it started as — the hidden input
		// carried the pick, not the default.
		cy.reload();
		cy.waitForHydration();
		cy.get('[data-testid="criterion-kind"]').first().should('contain.text', 'Select');
		// `have.value`, not `cy.contains`: Svelte writes the textarea's value as a
		// property, so the options never become a text node to search for.
		cy.get('textarea[name="options"]').first().should('have.value', 'Strong yes\nMaybe\nNo');
	});
});
