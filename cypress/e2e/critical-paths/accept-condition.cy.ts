/**
 * #445: a conditional accept is an accept with a note, not a second status.
 *
 * The committee names the condition and who will chase it. Reloading has to
 * keep the note on the list and the talk, and the same note has to sit on
 * the chase board until someone resolves it.
 */
const uniqueSlug = () => `acc445-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const TALK = 'A talk on the edge';
const CONDITION = 'bring a co-presenter from the business side';

describe('An organizer accepts with a condition', () => {
	it('keeps the note through a reload and clears it when resolved', () => {
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

			cy.get('[data-testid="accept-condition-text"]').type(CONDITION);
			cy.chooseFromAppSelect('accept-condition-owner', organizer.email);
			cy.contains('button', 'Accept').click();

			cy.get('[data-testid="submission-condition"]').should('contain', CONDITION);

			cy.reload();
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('contain', CONDITION);
			cy.get('[data-testid="submission-condition"]').should('contain', organizer.email);

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('contain', CONDITION);

			cy.visit(`/manage/${slug}/content`);
			cy.waitForHydration();
			cy.get('[data-testid="open-conditions"]').within(() => {
				cy.contains(TALK).should('exist');
				cy.get('[data-testid="condition-task"]').should('contain', CONDITION);
				cy.get('[data-testid="condition-task"]').should('contain', organizer.email);
			});

			cy.get('[data-testid="resolve-condition"]').click();
			cy.get('[data-testid="open-conditions"]').should('not.exist');

			cy.visit(`/manage/${slug}/submissions`);
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('not.exist');
			cy.contains('a', TALK).click();
			cy.waitForHydration();
			cy.get('[data-testid="submission-condition"]').should('not.exist');
		});
	});
});
