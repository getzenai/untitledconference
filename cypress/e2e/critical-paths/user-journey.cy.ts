import { CrudActions } from '../../support/actions/crud.actions';
import { generateTestUserEmail } from '../../support/globals';
import { CrudPage } from '../../support/pages/crud.page';
import { HomePage } from '../../support/pages/home.page';
import { RegisterPage } from '../../support/pages/register.page';

/**
 * Critical User Journey
 *
 * Ported from e2e/critical-paths/user-journey.test.ts (both tests were
 * permanently `test.fixme` in Playwright, so neither ever ran).
 *
 * Two deviations from the Playwright script, both forced by the app:
 *  - The registration form has no confirm-password and no organization-name
 *    field, so registration is email + password only.
 *  - The "Create Org" step is not part of the journey: /settings/organization
 *    redirects a user without an *active* organization to
 *    /settings/organization/new, which 500s (see the note in
 *    organization-lifecycle.cy.ts). Organization coverage lives there.
 *
 * Sign-up leaves `emailVerified` false, and this suite runs with
 * REQUIRE_EMAIL_VERIFICATION=false, as production does — so a new account is
 * signed in straight away and the journey starts on /home. Until this spec was
 * corrected it asserted the /verify-email interstitial, which is the state the
 * app produced by reading "unverified" as "not allowed in".
 */
describe('Critical User Journey', () => {
	const registerPage = new RegisterPage();
	const homePage = new HomePage();
	const crudPage = new CrudPage();

	it('Core user workflow: Register -> Create Item -> Logout -> Login', () => {
		const stamp = Date.now();
		const userEmail = generateTestUserEmail(`journey-${stamp}`);
		const crudItemName = `Journey Test Item ${stamp}`;
		const password = 'JourneyTest123!';

		// STEP 1: Register through the real form
		registerPage.visit();
		registerPage.register(userEmail, password);
		// No gate is configured, so registering ends where the work is.
		cy.url({ timeout: 20000 }).should('include', '/home');

		// STEP 2: Sign out and back in — the second visit must not gate either
		cy.logout();
		cy.loginViaUi(userEmail, password);
		homePage.shouldBeLoggedIn();

		// STEP 3: Create a CRUD item
		CrudActions.navigateToCrudPage();
		CrudActions.createExampleObject(crudItemName, 'Core journey test description');

		// STEP 4: Logout
		homePage.visit();
		homePage.logout();

		// STEP 5: Login again
		cy.loginViaUi(userEmail, password);
		homePage.shouldBeLoggedIn();

		// STEP 6: The item survived the session change
		CrudActions.navigateToCrudPage();
		CrudActions.verifyObjectExists(crudItemName);
		crudPage.createButton().should('be.visible');
	});

	it('Basic owner workflow validation', () => {
		const stamp = Date.now();
		const ownerEmail = generateTestUserEmail(`simple-owner-${stamp}`);
		const password = 'SimpleTest123!';
		const itemName = `Simple Item ${stamp}`;

		registerPage.visit();
		registerPage.register(ownerEmail, password);
		cy.url({ timeout: 20000 }).should('include', '/home');

		cy.logout();
		cy.loginViaUi(ownerEmail, password);
		homePage.shouldBeLoggedIn();

		// The CRUD example is no longer linked from the sidebar (PR #59 removed the
		// Vibe Starter "Examples" nav group), so reach it by URL like the other specs
		CrudActions.navigateToCrudPage();
		CrudActions.createExampleObject(itemName, 'Basic test description');
		CrudActions.verifyObjectExists(itemName);
	});
});
