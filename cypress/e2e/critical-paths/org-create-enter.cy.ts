/**
 * The first screen a new organizer sees is a form, so Enter creates the
 * organization (#485).
 *
 * The page used to ship no <form>: the name was a bare input and Create was
 * an onclick. Typing the name and pressing Enter — what everyone does on a
 * one-field screen — vanished. A unit test can see the <form> in the markup.
 * It cannot see that the keystroke actually creates the organization.
 */
import { generateTestUserEmail } from '../../support/globals';

describe('Creating an organization from the first screen', () => {
	it('creates the organization when you press Enter in the name field', () => {
		const stamp = Date.now();
		const email = generateTestUserEmail(`org-enter-${stamp}`);
		const password = 'OrgEnterPassword123!';
		const name = `Enter Org ${stamp}`;

		// Register through the real form: createTestUser always makes an
		// organization, and this page redirects anyone who already has one.
		cy.registerViaUi(email, password);
		cy.url({ timeout: 20000 }).should('include', '/home');

		cy.visit('/settings/organization/new');
		cy.waitForHydration();

		cy.get('[data-testid="create-organization-form"]').should('exist');
		cy.get('#orgName').type(`${name}{enter}`);

		cy.url({ timeout: 20000 }).should('include', '/settings/organization/');
		cy.url().should('not.include', '/settings/organization/new');
		cy.contains(name, { timeout: 20000 }).should('be.visible');
	});
});
