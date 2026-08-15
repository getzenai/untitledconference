/**
 * #410: both shells are the same Sidebar.Root family.
 *
 * The app rail stays mounted when the organizer opens a conference; the
 * conference destinations live on a second rail, not a handwritten aside.
 * Screenshots of both views go on the PR.
 *
 * `data-testid="app-sidebar"` lands on the sidebar-container via restProps.
 * `data-state` sits one level up on the wrapper. Read it there.
 */
const railState = () => cy.get('[data-testid="app-sidebar"]').parent();

describe('Shared sidebar shell', () => {
	it('keeps the app rail and adds a conference rail inside a workspace', () => {
		const stamp = Date.now();
		const slug = `shell-${stamp}`;
		const name = `Shell Conf ${stamp}`;

		cy.viewport(1440, 900);
		cy.createAndLogin({ organizationName: `Shell Org ${stamp}` });

		cy.visit('/home');
		cy.waitForHydration();
		cy.get('[data-testid="app-sidebar"]').should('be.visible');
		railState().should('have.attr', 'data-state', 'expanded');
		cy.get('[data-testid="sidebar-home-link"]').should('contain.text', 'untitledconference');
		cy.get('[data-testid="app-sidebar"] [data-testid="account-menu-trigger"]').should('be.visible');
		cy.get('[data-testid="conference-sidebar"]').should('not.exist');
		cy.screenshot('410-app-shell', { overwrite: true, capture: 'viewport' });

		cy.visit('/manage/new');
		cy.waitForHydration();
		cy.get('input[name="name"]').clear().type(name);
		cy.get('input[name="slug"]').clear().type(slug);
		cy.contains('button[type="submit"]', 'Create event').click();
		cy.location('pathname', { timeout: 20000 }).should('include', `/manage/${slug}/`);

		cy.get('[data-testid="app-sidebar"]').should('be.visible');
		// Icon rail: the app sidebar stayed mounted and collapsed for the second rail.
		railState().should('have.attr', 'data-state', 'collapsed');
		cy.get('[data-testid="conference-sidebar"]').should('be.visible');
		cy.get('[data-testid="switch-conference"]').should('have.attr', 'href', '/manage');
		cy.get('[data-testid="conference-nav-dashboard"]').should('be.visible');
		cy.get('[data-testid="conference-nav-rounds"]').should('contain.text', 'Rounds & scorecards');
		cy.get('[data-testid="conference-nav-people"]').should('contain.text', 'Reviewer pool');
		// One account menu, still on the app rail footer — not a second copy.
		cy.get('[data-testid="account-menu-trigger"]').should('have.length', 1);
		cy.get('[data-testid="app-sidebar"] [data-testid="account-menu-trigger"]').should('be.visible');
		cy.screenshot('410-conference-shell', { overwrite: true, capture: 'viewport' });

		cy.get('[data-testid="switch-conference"]').click();
		cy.location('pathname').should('eq', '/manage');
		cy.get('[data-testid="app-sidebar"]').should('be.visible');
		railState().should('have.attr', 'data-state', 'expanded');
		cy.get('[data-testid="conference-sidebar"]').should('not.exist');
		cy.get('[data-testid="app-sidebar"] [data-testid="account-menu-trigger"]').should('be.visible');

		// Bookmark / reload into the workspace: first paint is collapsed on
		// purpose. Leaving must restore the default, not that first-paint trick.
		cy.visit(`/manage/${slug}/dashboard`);
		cy.waitForHydration();
		railState().should('have.attr', 'data-state', 'collapsed');
		cy.get('[data-testid="switch-conference"]').click();
		cy.location('pathname').should('eq', '/manage');
		railState().should('have.attr', 'data-state', 'expanded');
	});
});
