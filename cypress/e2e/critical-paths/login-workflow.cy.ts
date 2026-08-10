import { CrudPage } from '../../support/pages/crud.page';
import { HomePage } from '../../support/pages/home.page';
import { LoginPage } from '../../support/pages/login.page';

/**
 * Critical Login Workflow
 *
 * Ported from e2e/critical-paths/login-workflow.test.ts.
 * Logs in through the real form (no cached session) and confirms the session
 * unlocks a protected page.
 */
describe('Critical Login Workflow', () => {
	const loginPage = new LoginPage();
	const homePage = new HomePage();
	const crudPage = new CrudPage();

	it('Login -> Navigate -> Perform Protected Action', () => {
		cy.createTestUser({ organizationName: 'Login Workflow Org' }).then((user) => {
			// STEP 1: Login through the UI
			loginPage.visit();
			loginPage.loginAndWaitForRedirect(user.email, user.password, '/home');
			homePage.shouldBeLoggedIn();

			// STEP 2: Navigate to protected content
			crudPage.visit();
			cy.url().should('include', '/examples/crud');

			// STEP 3: Verify the protected page is functional
			crudPage.createButton().should('be.visible');
			cy.contains('Existing Example Objects').should('be.visible');
		});
	});

	it('rejects invalid credentials and stays on /login', () => {
		loginPage.visit();
		loginPage.login('e2e-test-does-not-exist@example.com', 'WrongPassword123!');
		loginPage.shouldShowError();
		cy.url().should('include', '/login');
	});

	/**
	 * Regression for #80 / Sol review: product shells outside (with-sidebar)
	 * must offer Log out. /portal is reachable without a role seed; the same
	 * control sits on /review and /manage shells.
	 */
	it('logs out from a non-sidebar product shell (/portal)', () => {
		cy.createTestUser({ organizationName: 'Shell Logout Org' }).then((user) => {
			loginPage.visit();
			loginPage.loginAndWaitForRedirect(user.email, user.password, '/home');
			homePage.shouldBeLoggedIn();

			// Leave the sidebar layout — speakers/reviewers land here without NavUser.
			cy.visit('/portal');
			cy.waitForHydration();
			cy.get('[data-testid="app-sidebar"]').should('not.exist');
			cy.get('[data-testid="shell-logout"]').should('be.visible').click();
			cy.url({ timeout: 20000 }).should('include', '/login');
		});
	});
});
