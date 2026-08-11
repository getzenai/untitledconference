import { generateTestUserEmail } from '../../support/globals';
import { AdminDashboardPage } from '../../support/pages/admin/dashboard.page';
import { HomePage } from '../../support/pages/home.page';
import { RegisterPage } from '../../support/pages/register.page';

/**
 * First User Admin Assignment
 *
 * Ported from e2e/unauthenticated/first-user-admin.test.ts. That file was dead
 * code under Playwright: no project in playwright.config.ts covered
 * `e2e/unauthenticated`, so neither test was ever collected or run. Here they
 * do run - this spec sorts last, and it wipes the user table first so the
 * "first user" branch in src/lib/auth.ts is actually exercised.
 *
 * Registration leaves `emailVerified` false, and this suite runs with
 * REQUIRE_EMAIL_VERIFICATION=false — as production does. A new account is
 * therefore signed in immediately and lands on /home. It used to land on
 * /verify-email, and this spec asserted that: the app read "unverified" as "not
 * allowed in" even where nothing was gating on it, which put a dead end on the
 * first screen after registering. The `markEmailVerified` task is kept for the
 * checks that care about the flag itself, not about being let in.
 */
describe('First User Admin Assignment', () => {
	const registerPage = new RegisterPage();
	const homePage = new HomePage();
	const adminDashboard = new AdminDashboardPage();
	const password = 'TestPassword123!';

	before(() => {
		// The "first user becomes admin" rule only fires on an empty user table.
		cy.task('resetDatabase');
	});

	it('first registered user should automatically become admin', () => {
		const email = generateTestUserEmail('first-admin');

		cy.task('countUsers').should('eq', 0);

		registerPage.visit();
		registerPage.register(email, password);
		// Straight in: no verification gate is configured, so none may be shown.
		cy.url({ timeout: 20000 }).should('include', '/home');
		cy.url().should('not.include', '/verify-email');

		cy.task('getUserByEmail', email).should('deep.include', { email, role: 'admin' });

		// Signing out and back in must not produce the interstitial either — an
		// unverified address is the normal state here, on every visit.
		cy.logout();
		cy.loginViaUi(email, password);
		cy.url().should('not.include', '/verify-email');

		// Admin nav and the dashboard are both available to the first user
		homePage.shouldShowAdminNav();
		adminDashboard.visit();
		adminDashboard.shouldBeVisible();
		adminDashboard.shouldListUser(email);
	});

	it('second registered user should not become admin', () => {
		const email = generateTestUserEmail('regular-user');

		cy.task('countUsers').should('be.greaterThan', 0);

		registerPage.visit();
		// The app has no "you will be the system administrator" hint on the
		// register page; the regular description is what is shown. The string is
		// the register card's description — it moves when that copy is rewritten.
		cy.contains('One account for organizing, speaking and reviewing.').should('be.visible');
		cy.get('body').should(
			'not.contain.text',
			"You'll be the first user and will automatically become the system administrator"
		);

		registerPage.register(email, password);
		cy.url({ timeout: 20000 }).should('include', '/home');

		cy.task('getUserByEmail', email).should('deep.include', { email, role: 'user' });

		cy.logout();
		cy.loginViaUi(email, password);

		// No admin nav group in the sidebar
		homePage.shouldNotShowAdminNav();

		// Direct navigation is bounced back to /home
		cy.visit('/admin/users');
		cy.url({ timeout: 20000 }).should('include', '/home');
		cy.url().should('not.include', '/admin');
	});
});

describe('Admin Impersonation Feature', () => {
	// Not implemented in the app; kept skipped exactly as in the Playwright suite.
	// TODO: 1. log in as admin, 2. create a regular user, 3. impersonate,
	//       4. assert the impersonation banner, 5. stop impersonating.
	it.skip('admin should be able to impersonate regular user', () => {
		// Intentionally empty - see the TODO above.
	});
});
