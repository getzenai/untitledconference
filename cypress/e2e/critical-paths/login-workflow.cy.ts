import { HomePage } from '../../support/pages/home.page';
import { LoginPage } from '../../support/pages/login.page';

/**
 * Critical Login Workflow
 *
 * Ported from e2e/critical-paths/login-workflow.test.ts.
 * Logs in through the real form (no cached session) and confirms the session
 * unlocks a protected page.
 */
function assertSharedShell() {
	cy.get('[data-testid="app-sidebar"]').should('be.visible');
	cy.get('[data-testid="sidebar-home-link"]')
		.should('have.attr', 'href', '/home')
		.and('contain.text', 'untitledconference');
}

describe('Critical Login Workflow', () => {
	const loginPage = new LoginPage();
	const homePage = new HomePage();

	it('Login -> Navigate -> Perform Protected Action', () => {
		cy.createTestUser({ organizationName: 'Login Workflow Org' }).then((user) => {
			// STEP 1: Login through the UI
			loginPage.visit();
			loginPage.loginAndWaitForRedirect(user.email, user.password, '/home');
			homePage.shouldBeLoggedIn();

			// STEP 2: Navigate to protected content
			cy.visit('/manage');
			cy.url().should('include', '/manage');

			// STEP 3: Verify the protected page is functional. This user owns an
			// organization, so the page offers the action rather than the "create an
			// organization first" empty state.
			cy.contains('h1', 'My events').should('be.visible');
			cy.get('a[href="/manage/new"]').should('be.visible');
		});
	});

	it('rejects invalid credentials and stays on /login', () => {
		loginPage.visit();
		loginPage.login('e2e-test-does-not-exist@example.com', 'WrongPassword123!');
		loginPage.shouldShowError();
		cy.url().should('include', '/login');
	});

	it('keeps the shared sidebar across conferences, speaking and reviewing', () => {
		cy.createTestUser({ organizationName: 'Shell Logout Org' }).then((user) => {
			loginPage.visit();
			loginPage.loginAndWaitForRedirect(user.email, user.password, '/home');
			homePage.shouldBeLoggedIn();

			// This user owns an organization and reviews nothing, so the sidebar
			// offers Conferences and Speaking but not Reviewing (#239). `/review`
			// is still part of the shell, so it is reached by URL rather than by a
			// link that is correctly absent — the claim here is that the chrome
			// survives the navigation, not that everything is linked.
			for (const path of ['/manage', '/portal']) {
				cy.get(`[data-testid="app-sidebar"] a[href="${path}"]`).click();
				cy.url().should('include', path);
				assertSharedShell();
			}
			cy.visit('/review');
			assertSharedShell();
			cy.get('[data-testid="sidebar-home-link"]').click();
			cy.url().should('include', '/home');

			cy.get('[data-testid="app-sidebar"] [data-sidebar="footer"] button').first().click();
			cy.get('[data-testid="nav-user-logout"]').click();
			cy.url({ timeout: 20000 }).should('include', '/login');
		});
	});
});
