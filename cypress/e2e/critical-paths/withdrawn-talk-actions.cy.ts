/**
 * #716: a withdrawn talk is terminal on the speaker's side. The organizer can
 * see it, and cannot Accept, Decline, or assign reviewers.
 *
 * The committee flag is the counterfactual: without a reviewer on the round,
 * Assign is missing for the wrong reason. With one, its absence is the hide.
 */
const uniqueSlug = () => `wd716-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'Taken back before the decision';

describe('A withdrawn talk on the organizer page', () => {
	it('does not offer Accept, Decline or Assign', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((organizer) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: organizer.id,
					slug,
					days: ['2028-05-10'],
					sessions: [TALK],
					sessionStatus: 'withdrawn',
					committee: true
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.contains('a', TALK).click();
			cy.waitForHydration();

			cy.get('[data-status="withdrawn"]').should('exist');
			cy.get('[data-testid="decision-block-reason"]').should('contain', 'withdrew');
			cy.contains('button', 'Accept').should('not.exist');
			cy.contains('button', 'Decline').should('not.exist');
			cy.contains('button', 'Assign').should('not.exist');
		});
	});
});
