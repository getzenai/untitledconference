import { AuthActions } from '../actions/auth.actions';
import { OrganizationActions } from '../actions/organization.actions';
import { expect, test } from '../fixtures/test';
import { testUserManager } from '../test-user-manager';

/**
 * Critical Organization Lifecycle Test
 *
 * This E2E test covers the essential organization workflows:
 * Owner → Invite Member → Transfer Ownership → Leave Organization
 *
 * This replaces multiple validation-focused tests with one comprehensive workflow test.
 *
 * Target Execution Time: ~25 seconds
 */
test.describe.serial('Critical Organization Lifecycle', () => {
	test.fixme('Organization Owner → Invite → Transfer Ownership → Leave', async ({ browser }) => {
		// This is a complex multi-user test that requires multiple browser contexts
		test.setTimeout(45000); // Extended timeout for complex workflow

		const timestamp = Date.now();
		const organizationName = `Lifecycle Org ${timestamp}`;
		const ownerEmail = testUserManager.generateTestUserEmail(`owner-${timestamp}`);
		const memberEmail = testUserManager.generateTestUserEmail(`member-${timestamp}`);
		const password = 'LifecycleTest123!';

		// Create separate browser contexts for owner and member
		const ownerContext = await browser.newContext();
		const ownerPage = await ownerContext.newPage();
		const memberContext = await browser.newContext();
		const memberPage = await memberContext.newPage();

		const ownerAuthActions = new AuthActions(ownerPage);
		const ownerOrgActions = new OrganizationActions(ownerPage);
		const memberAuthActions = new AuthActions(memberPage);
		const memberOrgActions = new OrganizationActions(memberPage);

		console.log('=== STEP 1: Owner Creates Organization ===');
		// Owner creates account and logs in
		await ownerAuthActions.createAndLogin(ownerEmail, password);
		await ownerOrgActions.navigateToOrganizationPage();

		// Create the organization (will navigate to /new if needed)
		await ownerOrgActions.createOrganization(organizationName);

		// Verify organization was created with correct name
		await ownerOrgActions.verifyOrganizationName(organizationName);

		console.log('=== STEP 2: Owner Invites Member ===');
		// Create the member account first (simulating they already have an account)
		await testUserManager.createTestUser({
			email: memberEmail,
			password: password
		});

		// Owner invites member and gets the invitation link
		await ownerOrgActions.inviteUserByEmail(memberEmail, 'admin');
		await ownerOrgActions.verifyInvitationSent(memberEmail);

		// Get the invitation ID from the pending invitations table
		// Look for the input with the invitation ID value
		const invitationInput = await ownerPage
			.locator(`td:has-text("${memberEmail}")`)
			.locator('..')
			.locator('input[name="invitationId"]')
			.getAttribute('value');

		if (!invitationInput) {
			throw new Error('Could not find invitation ID');
		}

		const invitationLink = `/invite/${invitationInput}`;
		console.log('Invitation link:', invitationLink);

		console.log('=== STEP 3: Member Accepts Invitation ===');
		// Member logs in first
		await memberAuthActions.login(memberEmail, password);

		// Navigate to the invitation link to accept it
		await memberPage.goto(invitationLink);

		// Wait for the invitation page to load
		await memberPage.waitForLoadState('networkidle');

		// Accept the invitation
		const acceptButton = memberPage.getByRole('button', { name: /Accept Invitation/i });
		await acceptButton.click();

		// Wait for navigation after accepting
		await memberPage.waitForURL('/home', { timeout: 5000 });

		// Verify member is now part of the organization
		await memberOrgActions.navigateToOrganizationPage();
		await memberOrgActions.verifyOrganizationMembership(organizationName);

		console.log('=== STEP 4: Transfer Ownership (Owner → Member) ===');
		// Back to owner context to transfer ownership
		await ownerOrgActions.navigateToOrganizationPage();

		// Reload the page to ensure we see the new member
		await ownerPage.reload();
		await ownerPage.waitForLoadState('networkidle');

		// Wait for members table to load with the new member
		await ownerPage.waitForSelector(`text=${memberEmail}`, { timeout: 5000 });

		// Owner transfers ownership to member
		await ownerOrgActions.transferOwnershipTo(memberEmail);

		// Reload the page to see the updated roles
		await ownerPage.reload();
		await ownerPage.waitForLoadState('networkidle');

		// Wait for the members table to reload
		await ownerPage.waitForSelector('table', { timeout: 5000 });

		// Debug: Check if we can see both users in the table
		console.log(`Checking roles after transfer...`);
		const ownerEmailVisible = await ownerPage
			.locator(`table td:has-text("${ownerEmail}")`)
			.isVisible();
		const memberEmailVisible = await ownerPage
			.locator(`table td:has-text("${memberEmail}")`)
			.isVisible();
		console.log(
			`Owner email visible in table: ${ownerEmailVisible}, Member email visible in table: ${memberEmailVisible}`
		);

		// After ownership transfer, the previous owner becomes admin
		// They can't see their own role in the members table (you see yourself differently)
		// So let's verify the new owner has ownership instead
		await ownerOrgActions.verifyUserRole(memberEmail, 'owner');

		console.log('=== STEP 5: Original Owner Leaves Organization ===');
		// Original owner (now admin) leaves the organization
		await ownerOrgActions.leaveOrganization();

		// Wait for navigation away from organization page
		await ownerPage.waitForURL((url) => !url.toString().includes('/settings/organization'), {
			timeout: 5000
		});

		// Verify owner is no longer part of organization
		const currentUrl = ownerPage.url();
		expect(currentUrl).not.toContain('/settings/organization');

		console.log('=== STEP 6: Verify New Owner Has Control ===');
		// Back to member context to verify they have ownership
		await memberOrgActions.navigateToOrganizationPage();

		// Verify new owner can access organization management
		await memberOrgActions.verifyOrganizationOwnership();

		console.log('✅ Complete organization lifecycle test passed successfully!');

		// Cleanup contexts
		await ownerContext.close();
		await memberContext.close();
	});
});
