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
 * Sign-up leaves `emailVerified` false, so the app routes new users to
 * /verify-email. `markEmailVerified` stands in for clicking the link in the
 * verification email.
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
		cy.url({ timeout: 20000 }).should('include', '/verify-email');
		cy.task('markEmailVerified', userEmail);

		// STEP 2: Log in and land on the dashboard
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
		cy.url({ timeout: 20000 }).should('include', '/verify-email');
		cy.task('markEmailVerified', ownerEmail);

		cy.loginViaUi(ownerEmail, password);
		homePage.shouldBeLoggedIn();

		// The sidebar navigation reaches the protected CRUD example
		homePage.navigateToCrud();
		CrudActions.createExampleObject(itemName, 'Basic test description');
		CrudActions.verifyObjectExists(itemName);
	});
});
