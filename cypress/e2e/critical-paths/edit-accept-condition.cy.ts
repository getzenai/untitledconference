/**
 * #540: a condition on an accept can be rewritten after the click that accepted.
 *
 * The sentence is written in a hurry. Fixing a letter must not cost the slot
 * or the speaker confirmations — that is what declining and re-accepting does.
 */
const uniqueSlug = () => `ed540-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk on the edge';
const FIRST = 'bring a co-presenter from the business side';
const FIXED = 'bring two people from the business side';

describe('An organizer rewrites a condition after the accept', () => {
	it('keeps the new sentence through a reload and on the chase board', () => {
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

			cy.get('[data-testid="accept-condition-text"]').type(FIRST);
			cy.chooseFromAppSelect('accept-condition-owner', organizer.email);
			cy.contains('button', 'Accept').click();

			cy.get('[data-testid="submission-condition"]').should('contain', FIRST);
			cy.get('[data-testid="edit-condition-text"]').clear().type(FIXED);
			cy.get('[data-testid="save-condition"]').click();

			cy.get('[data-testid="submission-condition"]').should('contain', FIXED);

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('contain', FIXED);
			cy.get('[data-testid="edit-condition-text"]').should('have.value', FIXED);

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('contain', FIXED);

			cy.visit(`/manage/${slug}/content`);
			cy.waitForHydration();
			cy.get('[data-testid="open-conditions"]').within(() => {
				cy.contains(TALK).should('exist');
				cy.get('[data-testid="condition-task"]').should('contain', FIXED);
				cy.get('[data-testid="condition-task"]').should('contain', organizer.email);
			});
		});
	});
});
