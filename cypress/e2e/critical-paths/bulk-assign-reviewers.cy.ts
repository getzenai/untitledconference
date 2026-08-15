/**
 * ABS-06 part A: five talks × two reviewers in one click.
 *
 * Bulk-assign of a single reviewer is already on main (#208). This spec owns
 * the remaining DoD: several reviewers in one go, the created / skipped
 * message, and both reviewers' queue counters afterwards. Auto-distribute
 * and the cap live in #379.
 */
const uniqueSlug = () => `abs06-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALKS = ['Talk one', 'Talk two', 'Talk three', 'Talk four', 'Talk five'];

describe('Bulk assign several reviewers', () => {
	it('assigns two reviewers to five talks and updates both queue counters', () => {
		const slug = uniqueSlug();

		cy.createTestUser().then((first) => {
			cy.createTestUser().then((second) => {
				cy.createAndLogin().then((organizer) => {
					cy.request({
						method: 'POST',
						url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
						body: {
							userId: organizer.id,
							slug,
							days: ['2028-05-10'],
							sessions: TALKS,
							sessionStatus: 'submitted'
						}
					})
						.its('status')
						.should('eq', 200);

					for (const reviewer of [first, second]) {
						cy.visit(`/manage/${slug}/people`);
						cy.waitForHydration();
						cy.get('form[action="?/addReviewer"] input[name="email"]').type(reviewer.email);
						cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
						cy.get('[data-testid="people-committee"]').should('contain.text', reviewer.email);
					}

					cy.visit(`/manage/${slug}/rounds`);
					cy.waitForHydration();
					cy.get('form[action="?/add"] input[name="name"]').type('Screening');
					cy.contains('button[type="submit"]', 'Add round').click();
					cy.get('form[action="?/rename"] input[name="name"]').should('have.value', 'Screening');

					cy.visit(`/manage/${slug}/submissions`);
					cy.waitForHydration();
					cy.get('tbody tr').should('have.length', 5);
					cy.get('input[aria-label="Select every submission in view"]').check();

					// #413: round, committee and counts moved into a dialog; the strip
					// keeps decide and notify. The selection travels as hidden fields.
					cy.get('[data-testid="bulk-assign-open"]').should('not.be.disabled').click();
					cy.get('[data-testid="bulk-assign-dialog"]').should('be.visible');

					cy.get('[data-testid="bulk-assign-round"]').click();
					cy.get('[role="option"]').contains('Screening').click();
					cy.get('[data-testid="bulk-assign-reviewers"]').should('exist');
					cy.get('[data-testid="bulk-assign-reviewers"] label').should('have.length', 2);
					cy.get('[data-testid="bulk-assign-reviewers"] input[type="checkbox"]').check({
						force: true
					});

					cy.get('[data-testid="bulk-assign-submit"]').should('not.be.disabled').click();
					cy.get('[data-testid="bulk-assign-message"]').should(
						'contain.text',
						'10 assignments created'
					);

					cy.visit(`/manage/${slug}/people`);
					cy.waitForHydration();
					for (const reviewer of [first, second]) {
						cy.contains('[data-testid="people-committee"] li', reviewer.email)
							.should('contain.text', '0/5 submitted')
							.and('contain.text', '5 outstanding');
					}
				});
			});
		});
	});
});
