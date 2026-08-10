/**
 * The speaker and reviewer portals keep the app shell (#71).
 *
 * Fabian's walkthrough: "im Speaker und in dem Reviewer-Portal … bei beiden geht
 * die Seitenleiste verloren." Both are linked from the sidebar itself, so arriving
 * there and losing it left no way back. This is a routing-group property, and a
 * group is exactly the sort of thing that is easy to undo by moving one folder —
 * hence a browser test rather than a unit test on markup.
 */
describe('Speaker and reviewer portals keep the app shell', () => {
	it('shows the sidebar on the pages the sidebar links to', () => {
		cy.createAndLogin({ organizationName: 'Portal Shell Org' });

		cy.visit('/portal');
		cy.get('[data-testid="app-sidebar"]').should('exist');
		cy.contains('Speaking').should('exist');

		cy.visit('/review');
		cy.get('[data-testid="app-sidebar"]').should('exist');
		cy.contains('Reviewing').should('exist');
	});
});
