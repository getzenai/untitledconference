/**
 * The sidebar offers what the user actually has (#239).
 *
 * The reported symptom was a screen, so the check is a screen: a speaker who has
 * never organized anything was shown Conferences, Contacts and Reviewing, and
 * nothing told them which hat they were wearing.
 *
 * Two accounts, because they differ in exactly one relation:
 * - registering through the form creates no organization seat — the speaker;
 * - `createTestUser` creates one with the `owner` role — the organizer.
 *
 * Scope of what this proves: that the flags reach the markup and shorten the
 * list. It does not prove the boundary — the routes guard themselves, and
 * `access.integration.test.ts` owns that. Typing `/manage` here would still be
 * a 404 for the speaker, with or without the link.
 */
import { DEFAULT_TEST_PASSWORD, generateTestUserEmail } from '../../support/globals';
import { HomePage } from '../../support/pages/home.page';
import { RegisterPage } from '../../support/pages/register.page';

const homePage = new HomePage();

const sidebarLink = (href: string) => homePage.sidebar().find(`a[href="${href}"]`);

describe('Sidebar by relation', () => {
	it('offers a brand-new account Speaking, and the organizer entries locked', () => {
		const registerPage = new RegisterPage();
		const email = generateTestUserEmail('sidebar-speaker');

		registerPage.visit();
		registerPage.registerAndWaitForRedirect(email, DEFAULT_TEST_PASSWORD);
		cy.waitForHydration();

		// Anyone may submit a proposal, so this one is everyone's and stays.
		sidebarLink('/portal').should('be.visible');

		// The destinations themselves stay shut — the routes 404 for this account.
		sidebarLink('/manage').should('not.exist');
		sidebarLink('/contacts').should('not.exist');

		// But the product has a shape on day one (#439): both organizer entries are
		// on screen, carrying the reason and pointing at the form that opens them.
		for (const entry of ['events', 'contacts']) {
			homePage
				.sidebar()
				.find(`[data-testid="nav-locked-${entry}"]`)
				.should('be.visible')
				.and('have.attr', 'href', '/settings/organization/new')
				.and('contain.text', 'Create an organization');
		}

		// Nothing this person can do makes them a reviewer, so it stays hidden.
		sidebarLink('/review').should('not.exist');
		homePage.sidebar().find('[data-testid="nav-locked-reviewing"]').should('not.exist');
	});

	it('offers an organizer the organizer surfaces and not Reviewing', () => {
		cy.createAndLogin();
		cy.visit('/home');
		cy.waitForHydration();

		sidebarLink('/manage').should('be.visible');
		sidebarLink('/contacts').should('be.visible');
		sidebarLink('/portal').should('be.visible');
		homePage.sidebar().find('[data-testid^="nav-locked-"]').should('not.exist');

		// An owner who reviews nothing has no reviewer membership, and Reviewing
		// was the link that used to be there for everyone regardless.
		sidebarLink('/review').should('not.exist');
	});
});
