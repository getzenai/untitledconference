/**
 * #461: submitting a review must not blank the scorecard.
 *
 * The badge and the green banner already updated (invalidate + applyAction).
 * The fields used to go empty because `update()` reset to the first paint.
 * This spec submits, does not reload, and checks the values are still there.
 */
const uniqueSlug = () => `review-keep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Review submit keeps answers', () => {
	it('leaves the scorecard filled after Submit review, without a reload', () => {
		const slug = uniqueSlug();
		const comment = 'Measured, not invented — keep this after submit.';

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Keep the scores']
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
			// The saved label lives in an input value, not a text node: cy.contains
			// does not read input values, so assert on the value itself.
			cy.get('[data-testid="criterion-row"] input[name="label"]').should('have.value', 'Relevance');
			// Add-another still resets: the next label field is empty.
			cy.get('[data-testid="add-criterion-label"]').should('have.value', '');

			cy.visit(`/manage/${slug}/people`);
			cy.waitForHydration();
			cy.get('form[action="?/addReviewer"] input[name="email"]').type(organizer.email);
			cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
			cy.contains('[data-testid="people-committee"] li', organizer.email).should('exist');

			cy.visit(`/manage/${slug}/submissions`);
			cy.contains('a', 'Keep the scores').click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email)
				.contains('button', 'Assign')
				.click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email).should(
				'contain.text',
				'Unassign'
			);

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();
			cy.contains('a', 'Keep the scores').click();
			cy.waitForHydration();

			cy.get('input[type="number"][name^="criterion-"]').clear().type('4');
			cy.get('textarea[name="comment"]').type(comment);
			cy.contains('button', 'Submit review').click();

			cy.contains('Review submitted').should('exist');
			cy.contains('Reviewed').should('exist');
			cy.get('input[type="number"][name^="criterion-"]').should('have.value', '4');
			cy.get('textarea[name="comment"]').should('have.value', comment);
			cy.contains('button', 'Update review').should('exist');
		});
	});
});
