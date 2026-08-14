/**
 * An accepted talk says why it can no longer be edited (#496).
 *
 * The Edit button simply disappeared on acceptance, with no sentence anywhere,
 * and the direct URL answered with a 404 whose heading fought its own body —
 * "That page is not here" over "This proposal cannot be edited" — outside the
 * portal chrome, so the only way back was the browser's.
 *
 * A unit test can check the markup of one page. It cannot check where the URL
 * lands or whether the speaker is still inside the app when they get there,
 * which is the half of this that hurt.
 */
const uniqueSlug = () => `accepted-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('The edit URL of an accepted talk', () => {
	it('lands on the proposal with a reason, not on a 404 outside the portal', () => {
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
					sessions: ['Build systems without the wait'],
					speakerUserId: speaker.id
				}
			})
				.its('status')
				.should('eq', 200);
		});

		cy.visit('/portal');
		cy.waitForHydration();
		cy.contains('a', 'Build systems without the wait').click();
		cy.location('pathname').should('match', /^\/portal\/submissions\/\d+$/);

		// The affordance stays and carries its reason. Silence read as a bug at the
		// one moment the speaker cares most about the words.
		cy.get('[data-testid="edit-closed"]').should('be.visible').and('be.disabled');
		cy.contains('the organizers accepted these words').should('be.visible');

		cy.location('pathname').then((proposalPath) => {
			cy.visit(`${proposalPath}/edit`);
			cy.waitForHydration();

			// Not a 404, and not thrown out of the app: the same page, with the
			// explanation, and the portal still around it.
			cy.location('pathname').should('eq', proposalPath);
			cy.contains('That page is not here').should('not.exist');
			cy.get('[data-testid="edit-closed"]').should('be.visible');
			// The breadcrumb only exists on the proposal page; the error page drops
			// the whole app shell, which is how the speaker used to end up stranded.
			cy.get('a[href="/portal"]').should('exist');
		});
	});
});
