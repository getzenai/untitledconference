/**
 * #446: an accepted talk carries a named editorial stand, not a second status.
 *
 * The organizer sets where the deck is, reloading keeps that name, and
 * advancing moves one step along the line. The talk stays accepted.
 */
const uniqueSlug = () => `ed446-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk in the editorial loop';

describe('An organizer tracks an accepted talk after the yes', () => {
	it('sets a stand, keeps it through a reload, and advances it', () => {
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
					sessionStatus: 'submitted',
					reviewed: [TALK]
				}
			})
				.its('status')
				.should('eq', 200);

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.contains('a', TALK).click();
			cy.waitForHydration();

			cy.contains('button', 'Accept').click();
			cy.waitForHydration();

			cy.get('[data-testid="editorial-stand"]').should('exist');
			cy.chooseFromAppSelect('editorial-stand-select', 'Materials requested');
			cy.get('[data-testid="set-editorial-stand"]').click();

			cy.get('[data-testid="submission-editorial-stand"]').should('contain', 'Materials requested');

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="submission-editorial-stand"]').should('contain', 'Materials requested');

			cy.get('[data-testid="advance-editorial-stand"]').click();
			cy.get('[data-testid="submission-editorial-stand"]').should('contain', 'Received');

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.get('[data-testid="submission-editorial-stand"]').should('contain', 'Received');

			cy.visit(`/manage/${slug}/content`);
			cy.waitForHydration();
			cy.get('[data-testid="hanging-stands"]').within(() => {
				cy.contains(TALK).should('exist');
				cy.get('[data-testid="hanging-stand"]').should('contain', 'Received');
			});
		});
	});
});
