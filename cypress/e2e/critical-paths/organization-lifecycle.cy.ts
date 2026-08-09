import type { TestUser } from '../../support/globals';
import { generateTestUserEmail } from '../../support/globals';
import { OrganizationPage } from '../../support/pages/organization.page';

/**
 * Critical Organization Lifecycle:
 * Owner -> Invite Member -> Member Accepts -> Transfer Ownership -> Leave.
 *
 * Ported from e2e/critical-paths/organization-lifecycle.test.ts, which was
 * permanently `test.fixme` in Playwright and therefore never ran. Playwright
 * used two browser contexts; Cypress switches identity with `cy.session()`
 * instead, which gives the same two-user isolation inside a single browser.
 *
 * SKIPPED - blocked by two app bugs, not by the migration. Both were found by
 * actually running this spec; the Playwright `fixme` had been hiding them.
 *
 * 1. Nothing ever sets `session.activeOrganizationId` - there is no
 *    `databaseHooks.session.create` hook in src/lib/auth.ts and no call to
 *    `setActiveOrganization`. So `auth.api.getActiveMember()` throws
 *    `APIError: No active organization` for every freshly logged-in user;
 *    /settings/organization catches it and redirects to
 *    /settings/organization/new, whose load function does NOT catch it and
 *    answers `500 GET /settings/organization/new`. Every user therefore gets a
 *    500 on organization settings. `cy.setActiveOrganization()` below makes the
 *    call the app is missing, and gets the spec past this one.
 *
 * 2. Inviting a member fails outright:
 *      BetterAuthError: The field "createdAt" does not exist in the
 *      "invitation" Drizzle schema.
 *    `invitation` in src/lib/server/db/auth-schema.ts is missing the
 *    `createdAt` column that Better Auth's organization plugin writes, so
 *    `?/inviteMember` never creates an invitation and no pending-invite row
 *    appears. Fixing this needs a schema change plus a migration, which is out
 *    of scope for the test migration.
 *
 * Un-skip once (2) is fixed - and drop the `cy.setActiveOrganization()` calls
 * once (1) is fixed. The body below is the full lifecycle and is verified to
 * work up to the invite step.
 */
describe.skip('Critical Organization Lifecycle', () => {
	const orgPage = new OrganizationPage();

	it('Organization Owner -> Invite -> Accept -> Transfer Ownership -> Leave', () => {
		const stamp = Date.now();
		const organizationName = `Lifecycle Org ${stamp}`;
		const memberEmail = generateTestUserEmail(`member-${stamp}`);
		const password = 'LifecycleTest123!';

		let owner: TestUser;
		let member: TestUser;

		cy.createTestUser({ password, organizationName }).then((user) => {
			owner = user;
		});
		cy.createTestUser({ email: memberEmail, password }).then((user) => {
			member = user;
		});

		cy.then(() => {
			// STEP 1: Owner sees their organization
			cy.login(owner.email, owner.password);
			cy.setActiveOrganization(organizationName);
			orgPage.visit();
			orgPage.shouldHaveName(organizationName);

			// STEP 2: Owner invites the member as admin
			orgPage.inviteEmailInput().clear().type(member.email);
			// The page renders an sr-only native <select> next to the bits-ui
			// dropdown specifically so tests can pick a role; it is visually
			// covered, hence force.
			cy.get('select[aria-label="Role for testing"]').select('admin', { force: true });
			orgPage.inviteButton().click();
			cy.contains('td', member.email, { timeout: 20000 }).should('exist');

			// STEP 3: Member accepts the invitation
			orgPage.invitationId(member.email).then((invitationId) => {
				cy.login(member.email, member.password);
				cy.visit(`/invite/${invitationId}`);
				cy.waitForHydration();
				cy.contains('button', /Accept Invitation/i, { timeout: 20000 }).click();
				cy.url({ timeout: 20000 }).should('include', '/home');

				// The member is now part of the owner's organization
				cy.setActiveOrganization(organizationName);
				orgPage.visit();
				orgPage.shouldHaveName(organizationName);

				// STEP 4: Owner transfers ownership to the member
				cy.login(owner.email, owner.password);
				cy.setActiveOrganization(organizationName);
				orgPage.visit();
				orgPage.shouldHaveMember(member.email);
				orgPage.changeMemberRole(member.email, 'owner');
				orgPage.memberRole(member.email).should('contain.text', 'owner');

				// STEP 5: The former owner (now admin) leaves the organization
				orgPage.reload();
				orgPage.leaveOrganizationButton().click();
				cy.get('form[action="?/leaveOrganization"]')
					.find('button[type="submit"]')
					.should('be.enabled')
					.click();
				cy.contains('h1', organizationName, { timeout: 20000 }).should('not.exist');

				// STEP 6: The new owner still controls the organization
				cy.login(member.email, member.password);
				cy.setActiveOrganization(organizationName);
				orgPage.visit();
				orgPage.shouldHaveName(organizationName);
			});
		});
	});
});
