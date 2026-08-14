/**
 * Withdrawing from a conference asks first (#495).
 *
 * "I can't take part" sat among ordinary task actions that cost nothing, and one
 * click withdrew the speaker from the whole event — no dialog, no undo offered on
 * the screen, and the roster already flipped by the time the page came back.
 *
 * A unit test can see that the page has a dialog in its markup. It cannot see
 * that the click is intercepted before the POST, that backing out leaves the
 * roster alone, or that going through really withdraws. That is the whole
 * feature, so it is checked here: cancel, and the answer is still unanswered;
 * confirm, and the state has moved.
 */
const uniqueSlug = () => `withdraw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Telling the organizers you cannot take part', () => {
	it('asks before it withdraws, and does nothing when you back out', () => {
		const slug = uniqueSlug();

		cy.createAndLogin().then((speaker) => {
			cy.request({
				method: 'POST',
				url: `${Cypress.config('baseUrl')}/api/v1/test/agenda-fixture`,
				body: {
					userId: speaker.id,
					slug,
					name: 'DevFlow Conf 2028',
					days: ['2028-05-10'],
					// Two accepted talks: the answer covers the event, not the talk whose
					// task happens to be open, and the dialog has to say so.
					sessions: ['Build systems without the wait', 'Practical event streaming'],
					speakerUserId: speaker.id
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', 'Confirm participation').click();
		cy.waitForHydration();

		cy.contains('button', 'I can’t take part').click();

		// The guard: a dialog, not a withdrawal.
		cy.get('[data-testid="withdraw-dialog"]').should('be.visible');
		cy.get('[data-testid="withdraw-dialog"]').should('contain.text', 'DevFlow Conf 2028');
		cy.get('[data-testid="withdraw-dialog"]').should(
			'contain.text',
			'all 2 of your accepted talks'
		);

		cy.get('[data-testid="withdraw-cancel"]').click();

		// Backing out is not a slow withdrawal. The page still asks the question.
		cy.get('[data-testid="withdraw-dialog"]').should('not.exist');
		cy.contains('You told the organizers you cannot take part.').should('not.exist');
		cy.contains('button', 'Yes, I’ll be there').should('exist');

		cy.contains('button', 'I can’t take part').click();
		cy.get('[data-testid="withdraw-confirm"]').click();

		// And through the dialog it really goes: the answer is recorded, and the
		// way back is on the same screen.
		cy.contains('You told the organizers you cannot take part.', { timeout: 20000 }).should(
			'be.visible'
		);
		cy.contains('button', 'Yes, I’ll be there').should('exist');

		// The question goes away with the answer. Left standing, the speaker reads
		// "you cannot take part" underneath a dialog still asking whether they want
		// to, and is offered "Keep my place" after the place is gone.
		cy.get('[data-testid="withdraw-dialog"]').should('not.exist');

		// The task board used to call this Done and count it towards "N of M done".
		cy.visit('/portal');
		cy.waitForHydration();
		cy.get('[data-testid="task-withdrawn"]').should('be.visible');
		cy.contains('1 of 1 done').should('not.exist');
	});
});
