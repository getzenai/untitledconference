/**
 * #737: a typed review must survive the queue and a reload, without Save.
 *
 * The CFP form already parks what was typed. The scorecard did not — leaving
 * for the queue, or refreshing, emptied the comment. This spec never clicks
 * Save progress or Submit; if it has to, the hole is still open.
 */
const uniqueSlug = () => `review-autosave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Scorecard autosave', () => {
	it('keeps an unsaved comment and score after the queue and a reload', () => {
		const slug = uniqueSlug();
		const comment = `Unsaved on purpose ${Date.now()} — must survive the queue.`;

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: ['Keep the unsaved review']
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
			cy.contains('a', 'Keep the unsaved review').click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email)
				.contains('button', 'Assign')
				.click();
			cy.contains('[data-testid="review-assignments"] li', organizer.email).should(
				'contain.text',
				'Unassign'
			);

			cy.visit(`/review/${slug}`);
			cy.waitForHydration();
			cy.contains('a', 'Keep the unsaved review').click();
			cy.waitForHydration();

			cy.get('input[type="number"][name^="criterion-"]').clear().type('4');
			cy.get('textarea[name="comment"]').clear().type(comment);

			cy.contains('a', 'Back to reviewing').click();
			cy.waitForHydration();
			cy.contains('a', 'Keep the unsaved review').click();
			cy.waitForHydration();

			cy.get('textarea[name="comment"]').should('have.value', comment);
			cy.get('input[type="number"][name^="criterion-"]').should('have.value', '4');
			cy.get('[data-testid="review-autosave-notice"]').should(
				'contain.text',
				'Your unsaved review is still here.'
			);
			cy.contains('button', 'Submit review').should('exist');

			cy.reload();
			cy.waitForHydration();
			cy.get('textarea[name="comment"]').should('have.value', comment);
			cy.get('input[type="number"][name^="criterion-"]').should('have.value', '4');
			cy.get('[data-testid="review-autosave-notice"]').should('exist');
		});
	});
});
