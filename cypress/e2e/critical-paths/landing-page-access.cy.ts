/**
 * Reaching the product page while signed in (#237).
 *
 * `/` redirects an authenticated visitor to `/home`, which is the right default and
 * had no way around it: Fabian, signed in, could not get back to the page that says
 * what this product is. The bypass is `?home=0`.
 *
 * A browser is the only place this is real. The redirect happens on the server, the
 * way in is a menu item in the sidebar, and the trap the unit tests cannot see is the
 * logo: a plain `href="/"` on the product page sends the same user straight back into
 * the app, which would undo the bypass with one click.
 */
describe('The product page for a signed-in user', () => {
	beforeEach(() => {
		cy.createAndLogin();
	});

	it('redirects / to the app, as before', () => {
		cy.visit('/');
		cy.location('pathname').should('eq', '/home');
	});

	it('opens the product page from the account menu and stays there', () => {
		cy.visit('/home');
		// The menu is a bits-ui dropdown, so it opens from a Svelte handler and not
		// from markup: a click that lands before hydration hits a button with
		// nothing attached and is swallowed silently. `cy.logout()` waits here for
		// the same reason — this test used the same handle without the same wait,
		// and lost the race on a slower machine.
		cy.waitForHydration();

		// Same handle the logout journey uses: the footer button of the sidebar
		// opens the account menu.
		cy.get('[data-testid="app-sidebar"] [data-sidebar="footer"] button').first().click();
		cy.get('[data-testid="nav-user-product-page"]').click();

		cy.location('pathname').should('eq', '/');
		cy.location('search').should('eq', '?home=0');
		cy.contains('Run the whole conference.').should('be.visible');

		// The logo is the click that used to throw the reader back into the app.
		cy.contains('a', 'untitledconference').first().click();
		cy.location('pathname').should('eq', '/');
		cy.contains('Run the whole conference.').should('be.visible');
	});

	it('offers the way back instead of a way in', () => {
		cy.visit('/?home=0');

		cy.get('[data-testid="landing-back-to-work"]').click();
		cy.location('pathname').should('eq', '/home');
	});
});
