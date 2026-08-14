/**
 * The page a wrong address lands on (#377).
 *
 * Before this the tree had no `+error.svelte`, so a mistyped slug off a poster
 * rendered SvelteKit's built-in fallback: a bare heading on an unstyled body,
 * with no link anywhere. The visitor's only way out was the back button.
 *
 * A browser is the only place the fix is real. The three things that would make
 * it a dead end again — the header not rendering, the buttons not being links,
 * the status not staying 404 — are all invisible to a unit test, and a `curl`
 * cannot tell a hydrated page from markup that throws on hydration.
 */
describe('the error page', () => {
	it('gives an anonymous visitor a styled 404 and a way onward', () => {
		cy.request({ url: '/c/definitely-not-a-conference-xyz', failOnStatusCode: false })
			.its('status')
			.should('eq', 404);

		cy.visit('/c/definitely-not-a-conference-xyz', { failOnStatusCode: false });
		cy.waitForHydration();

		cy.get('[data-testid="error-status"]').should('have.text', '404');
		// The message comes from the throw in `(public)/c/[slug]/+layout.server.ts`.
		// A generic "page not found" here would be a worse sentence than the one
		// the app already has.
		cy.get('[data-testid="error-message"]').should('contain', 'No conference with that address');

		// The header is the proof it renders inside the product and not on a bare
		// body: logo, wordmark, theme toggle.
		cy.contains('untitledconference').should('be.visible');

		// The point of the page. Anonymous: the directory first, because the front
		// door is where a visitor without an account finds a conference.
		cy.get('[data-testid="error-directory"]').should('have.attr', 'href', '/#live-events');
		cy.get('[data-testid="error-home"]').click();
		cy.location('pathname').should('eq', '/');
	});

	it('sends a signed-in organizer with a stale /manage link back to their work', () => {
		cy.createAndLogin();

		cy.visit('/manage/definitely-not-a-conference-xyz', { failOnStatusCode: false });
		cy.waitForHydration();

		cy.get('[data-testid="error-status"]').should('have.text', '404');
		cy.get('[data-testid="error-message"]').should('contain', 'Conference not found');

		// `/` would bounce them to `/home` anyway; naming it directly means the
		// primary button is not a redirect in disguise.
		cy.get('[data-testid="error-home"]').should('have.attr', 'href', '/home').click();
		cy.location('pathname').should('eq', '/home');
	});
});
