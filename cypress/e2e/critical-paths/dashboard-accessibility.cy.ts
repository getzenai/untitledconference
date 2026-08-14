/**
 * The organizer's landing page, read by a machine that only has the accessibility
 * tree (#456).
 *
 * Four axe violations were found by hand on a populated dashboard, and a hand
 * finds them once. This spec is the part that keeps them gone: it builds a
 * conference with the pieces that make the page grow — a reviewer table, a round,
 * an assignment — and then asks axe. An empty dashboard would pass while the real
 * one fails.
 *
 * Only the four rules that fired are asserted. A blanket "no violations anywhere"
 * would turn any unrelated addition into a red run here, and this spec would be
 * disabled rather than fixed.
 */
import 'cypress-axe';

const uniqueSlug = () => `a11y-dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const RULES = ['color-contrast', 'landmark-unique', 'nested-interactive', 'region'];

describe('Conference dashboard accessibility', () => {
	it('has no landmark, nesting or contrast violations on a populated dashboard', () => {
		const slug = uniqueSlug();

		cy.createTestUser().then((reviewer) => {
			cy.createAndLogin().then((organizer) => {
				cy.request({
					method: 'POST',
					url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
					body: {
						userId: organizer.id,
						slug,
						days: ['2028-05-10'],
						sessions: ['First talk', 'Second talk']
					}
				})
					.its('status')
					.should('eq', 200);

				cy.visit(`/manage/${slug}/people`);
				cy.waitForHydration();
				cy.get('form[action="?/addReviewer"] input[name="email"]').type(reviewer.email);
				cy.contains('form[action="?/addReviewer"] button', 'Add or invite').click();
				cy.get('[data-testid="people-committee"]').should('contain.text', reviewer.email);

				cy.visit(`/manage/${slug}/rounds`);
				cy.waitForHydration();
				cy.get('form[action="?/add"] input[name="name"]').type('Screening');
				cy.contains('button[type="submit"]', 'Add round').click();
				cy.get('form[action="?/rename"] input[name="name"]').should('have.value', 'Screening');

				// An outstanding review is what makes the reviewer table — and the row
				// button inside it — render at all.
				cy.visit(`/manage/${slug}/submissions`);
				cy.contains('a', 'First talk').click();
				cy.contains('[data-testid="review-assignments"] li', reviewer.email)
					.contains('button', 'Assign')
					.click();
				cy.contains('[data-testid="review-assignments"] li', reviewer.email).should(
					'contain.text',
					'Unassign'
				);

				cy.visit(`/manage/${slug}/dashboard`);
				cy.waitForHydration();
				cy.get('[data-testid="reviewer-row"]').should('exist');

				cy.injectAxe();
				cy.checkA11y(undefined, { runOnly: { type: 'rule', values: RULES } }, (violations) => {
					// The default reporter prints a count and a table Cypress truncates.
					// The selector is the only part that says where to look.
					for (const violation of violations) {
						cy.task(
							'log',
							`[axe] ${violation.id} (${violation.impact}) — ${violation.nodes
								.map((node) => `${node.target.join(' ')} :: ${node.html.slice(0, 160)}`)
								.join(' | ')}`
						);
					}
				});
			});
		});
	});
});
