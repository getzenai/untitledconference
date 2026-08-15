/**
 * #477: a score past the top of its scale is refused in our own words.
 *
 * Two things were wrong on the same keystroke. The browser drew its own bubble
 * ("Value must be less than or equal to 5") in its own font on a page that has
 * two ways of saying things already — and behind that bubble the number was
 * DROPPED rather than clamped, so anybody who got past it saved a blank
 * criterion and was told their progress was saved. The red panel that did
 * appear talked about submitting, to somebody who had pressed Save progress.
 *
 * The unit suite pins the sentence and the integration suite pins the refusal.
 * This is the typing.
 */
const uniqueSlug = () => `rev-scale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('A reviewer types a score off the scale', () => {
	it('names the criterion and its scale, and keeps the earlier score', () => {
		const slug = uniqueSlug();
		const talk = 'A talk scored out of five';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [talk]
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/rounds`);
			cy.waitForHydration();
			cy.get('form[action="?/add"] input[name="name"]').type('Screening');
			cy.contains('button[type="submit"]', 'Add round').click();
			cy.get('[data-testid="round-summary"]').should('contain.text', 'Open');

			cy.get('[data-testid="add-criterion-label"]').type('Relevance');
			cy.get('[data-testid="add-criterion-submit"]').click();
			cy.get('[data-testid="criterion-row"] input[name="label"]').should('have.value', 'Relevance');

			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

			cy.visit(`/manage/${slug}/submissions`);
			cy.contains('a', talk).click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email)
				.contains('button', 'Assign')
				.click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email).should(
				'contain.text',
				'Unassign'
			);

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();
			cy.contains('a', talk).click();
			cy.waitForHydration();

			// A score that fits saves the ordinary way.
			cy.get('input[type="number"][name^="criterion-"]').clear().type('3');
			cy.contains('button', 'Save progress').click();
			cy.contains('Progress saved').should('exist');

			// Now the typo. The message is ours, sits under the field, and says
			// which criterion and what its scale is.
			cy.get('input[type="number"][name^="criterion-"]').clear().type('50');
			cy.get('[data-testid="criterion-error"]').should(
				'contain.text',
				'Relevance is scored out of 5, so 50 is off the scale.'
			);
			cy.get('input[type="number"][name^="criterion-"]').should(
				'have.attr',
				'aria-invalid',
				'true'
			);

			// Pressing Save progress does not go through, and nothing on the page
			// starts talking about submitting to somebody who did not submit.
			cy.contains('button', 'Save progress').click();
			cy.get('[data-testid="criterion-error"]').should('exist');

			// The stored 3 is what a reload finds — the typo was never written.
			cy.reload();
			cy.waitForHydration();
			cy.get('input[type="number"][name^="criterion-"]').should('have.value', '3');
			cy.get('[data-testid="criterion-error"]').should('not.exist');
		});
	});
});
