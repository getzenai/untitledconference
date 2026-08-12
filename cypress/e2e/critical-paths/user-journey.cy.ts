import { generateTestUserEmail } from '../../support/globals';
import { HomePage } from '../../support/pages/home.page';
import { RegisterPage } from '../../support/pages/register.page';

/**
 * Critical User Journey
 *
 * Two deviations from the obvious script, both forced by the app:
 *  - The registration form has no confirm-password and no organization-name
 *    field, so registration is email + password only.
 *  - Creating an organization is not part of the journey: /settings/organization
 *    redirects a user without an *active* organization to
 *    /settings/organization/new, which 500s (see the note in
 *    organization-lifecycle.cy.ts). Organization coverage lives there.
 *
 * Sign-up leaves `emailVerified` false, and this suite runs with
 * REQUIRE_EMAIL_VERIFICATION=false, as production does — so a new account is
 * signed in straight away and the journey starts on /home. Until this spec was
 * corrected it asserted the /verify-email interstitial, which is the state the
 * app produced by reading "unverified" as "not allowed in".
 *
 * The second test is the one that costs something to lose: it creates a real
 * conference through the real form and comes back to it in a *different
 * session*. A session that is merely accepted at /home proves the cookie; only
 * reading your own row back after signing out and in again proves the account
 * the cookie names is the one that owns the data.
 */
describe('Critical User Journey', () => {
	const registerPage = new RegisterPage();
	const homePage = new HomePage();

	it('registers through the real form and survives a sign-out', () => {
		const userEmail = generateTestUserEmail(`journey-${Date.now()}`);
		const password = 'JourneyPassword123!';

		registerPage.visit();
		registerPage.register(userEmail, password);
		// No verification gate is configured, so registering ends where the work is.
		cy.url({ timeout: 20000 }).should('include', '/home');

		homePage.visit();
		homePage.logout();

		cy.loginViaUi(userEmail, password);
		homePage.shouldBeLoggedIn();
	});

	it('creates a conference that is still there in the next session', () => {
		const stamp = Date.now();
		const slug = `journey-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
		const name = `Journey Conf ${stamp}`;

		// createTestUser gives the account an organization, which /manage/new
		// requires — a conference belongs to one.
		cy.createTestUser({ organizationName: `Journey Org ${stamp}` }).then((user) => {
			cy.loginViaUi(user.email, user.password);

			cy.visit('/manage/new');
			cy.waitForHydration();
			cy.get('input[name="name"]').clear().type(name);
			cy.get('input[name="slug"]').clear().type(slug);
			cy.contains('button[type="submit"]', 'Create conference').click();

			// The action redirects into the setup flow for the new conference.
			cy.url({ timeout: 20000 }).should('include', `/manage/${slug}/settings`);

			cy.logout();
			cy.loginViaUi(user.email, user.password);

			cy.visit('/manage');
			cy.contains(name).should('be.visible');
		});
	});
});
