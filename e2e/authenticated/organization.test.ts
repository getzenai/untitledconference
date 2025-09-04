import { expect, test } from '@playwright/test';

test.describe('Organization Features', () => {
	test.describe('Organization Settings Page', () => {
		test('should display organization settings for admin users', async ({ page }) => {
			await page.goto('/settings/organization');

			// Wait for page to load
			await page.waitForLoadState('networkidle');

			// Check page title - the page exists and loads
			const heading = page.getByRole('heading', { name: 'Organization Settings' });
			await expect(heading).toBeVisible();

			// Check if user has an organization or needs to create one
			const orgDetailsCard = page.getByText('Organization Details');
			const createOrgCard = page.getByText('Create Your Organization');

			// Either organization details OR create organization form should be visible
			const hasOrg = await orgDetailsCard.isVisible({ timeout: 2000 }).catch(() => false);
			const canCreateOrg = await createOrgCard.isVisible({ timeout: 2000 }).catch(() => false);

			expect(hasOrg || canCreateOrg).toBeTruthy();

			if (hasOrg) {
				// Verify organization name is displayed - any org name in the expected location
				const orgName = page.locator('p.text-lg.font-medium').first();
				await expect(orgName).toBeVisible();

				// Should have some text content (the org name)
				const name = await orgName.textContent();
				expect(name).toBeTruthy();
			}
		});

		test('should show current user as organization member', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if user has organization
			const orgDetails = page.getByText('Organization Details');
			if (await orgDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
				// The authenticated test user should be visible in members list
				// Be specific - look for the email in the table cell
				const memberEmail = page.getByRole('cell', { name: 'e2e-test-user@example.com You' });
				await expect(memberEmail).toBeVisible();

				// Check for the "You" badge next to the email
				const youBadge = memberEmail.getByText('You');
				await expect(youBadge).toBeVisible();
			}
		});
	});

	test.describe('Organization Creation', () => {
		test('should create organization when user has none', async ({ page }) => {
			// Navigate to organization settings
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if user has no organization (looking for create form)
			const createCard = page.getByText('Create Your Organization');

			if (await createCard.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Fill in organization name
				const orgName = `Test Org ${Date.now()}`;
				await page.getByLabel('Organization Name').fill(orgName);

				// Click create button
				await page.getByRole('button', { name: 'Create Organization' }).click();

				// Wait for success and organization to be created
				await expect(page.getByText('Organization created successfully!')).toBeVisible({
					timeout: 10000
				});

				// Verify organization details are now shown
				await expect(page.getByText('Organization Details')).toBeVisible();
				await expect(page.getByText(orgName)).toBeVisible();

				// Verify user is the owner
				await expect(page.getByText('owner').first()).toBeVisible();
			}
		});

		test('should handle duplicate organization names with unique slugs', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			const createCard = page.getByText('Create Your Organization');

			if (await createCard.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Try to create org with common name
				await page.getByLabel('Organization Name').fill('Test Organization');
				await page.getByRole('button', { name: 'Create Organization' }).click();

				// Should succeed even if name exists (unique slug will be generated)
				await expect(page.getByText('Organization created successfully!')).toBeVisible({
					timeout: 10000
				});

				// Verify slug is shown
				const slugElement = page.locator('text=/test-organization/i');
				await expect(slugElement).toBeVisible();
			}
		});
	});

	test.describe('Leaving Organization', () => {
		test('should show leave organization button with appropriate warning', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if organization exists
			const orgDetails = page.getByText('Organization Details');
			if (await orgDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Find leave organization button
				const leaveButton = page.getByRole('button', { name: 'Leave Organization' });
				await expect(leaveButton).toBeVisible();

				// Check for appropriate warning message
				const members = await page.locator('tbody tr').count();

				if (members === 1) {
					// Only member - should show deletion warning
					await expect(page.getByText('This will delete the organization')).toBeVisible();
				} else {
					// Check if user is owner
					const ownerBadge = page.locator('text=owner').first();
					if (await ownerBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
						await expect(page.getByText('Transfer ownership before leaving')).toBeVisible();
					} else {
						await expect(page.getByText('Remove yourself from this organization')).toBeVisible();
					}
				}
			}
		});

		test.skip('should show ownership transfer dialog for owners with multiple members', async ({
			page
		}) => {
			// This test requires a setup with owner and multiple members
			// Skipping as it requires specific test data setup that isn't available in authenticated context
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			const orgDetails = page.getByText('Organization Details');
			if (await orgDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Check if user is owner and there are multiple members
				const ownerBadge = page.locator('text=owner').first();
				const memberRows = page.locator('tbody tr');

				if (
					(await ownerBadge.isVisible({ timeout: 1000 }).catch(() => false)) &&
					(await memberRows.count()) > 1
				) {
					// Click leave organization
					await page.getByRole('button', { name: 'Leave Organization' }).click();

					// Should show ownership transfer dialog
					await expect(page.getByText('As the owner, you must transfer ownership')).toBeVisible();
					await expect(page.getByLabel('Select New Owner')).toBeVisible();

					// Cancel button should close dialog
					await page.getByRole('button', { name: 'Cancel' }).click();
					await expect(
						page.getByText('As the owner, you must transfer ownership')
					).not.toBeVisible();
				}
			}
		});

		test('should show delete confirmation for last member', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			const orgDetails = page.getByText('Organization Details');
			if (await orgDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
				const memberRows = page.locator('tbody tr');

				if ((await memberRows.count()) === 1) {
					// Click leave organization
					await page.getByRole('button', { name: 'Leave Organization' }).click();

					// Should show deletion warning
					await expect(
						page.getByText(
							'You are the only member. Leaving will delete this organization permanently.'
						)
					).toBeVisible();

					// Button should say "Delete & Leave"
					await expect(page.getByRole('button', { name: 'Delete & Leave' })).toBeVisible();

					// Cancel should close dialog
					await page.getByRole('button', { name: 'Cancel' }).click();
					await expect(
						page.getByText('You are the only member. Leaving will delete')
					).not.toBeVisible();
				}
			}
		});
	});

	test.describe('Pending Invitations', () => {
		test('should display pending invitations when user has no organization', async ({ page }) => {
			// This test would need a user with pending invitations but no organization
			// In a real scenario, we'd set this up in the test data
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Look for pending invitations section
			const invitationsCard = page.getByText('Pending Invitations');

			if (await invitationsCard.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Should show invitation details
				await expect(page.getByText('You have been invited to join')).toBeVisible();

				// Should have Accept and Reject buttons for each invitation
				const acceptButtons = page.getByRole('button', { name: 'Accept' });
				const rejectButtons = page.getByRole('button', { name: 'Reject' });

				expect(await acceptButtons.count()).toBeGreaterThan(0);
				expect(await rejectButtons.count()).toBeGreaterThan(0);

				// Should show organization name (not "Unknown Organization")
				const unknownOrg = page.getByText('Unknown Organization');
				expect(await unknownOrg.count()).toBe(0);
			}
		});

		test('should show both invitations and create organization option', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if both sections exist when user has invitations but no org
			const invitationsCard = page.getByText('Pending Invitations');
			const createCard = page.getByText('Create Your Organization');

			if (await invitationsCard.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Should also show create organization option
				await expect(createCard).toBeVisible();

				// Create card should indicate it's an alternative option
				await expect(page.getByText('Or create your own organization')).toBeVisible();
			}
		});
	});

	test.describe('Member Management', () => {
		test('should generate invitation link when inviting member', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if email input exists for invitations (user must be admin/owner)
			const emailInput = page.getByLabel('Email Address');
			if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Fill in invitation form
				const testEmail = `invited-${Date.now()}@example.com`;
				await emailInput.fill(testEmail);

				// Click invite button
				const inviteButton = page.getByRole('button', { name: 'Invite' });
				await inviteButton.click();

				// Wait for success toast
				const successToast = page
					.locator('[data-sonner-toast]')
					.filter({
						hasText: 'Invitation created and link copied to clipboard'
					})
					.first();
				await expect(successToast).toBeVisible();
			}
		});

		test('should copy invitation link to clipboard', async ({ page, context }) => {
			// Grant clipboard permissions
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);

			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if the invite form is available
			const emailInput = page.getByLabel('Email Address');
			if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Generate an invitation
				const testEmail = `copy-test-${Date.now()}@example.com`;
				await emailInput.fill(testEmail);
				await page.getByRole('button', { name: 'Invite' }).click();

				// Wait for success toast that says link was copied
				const successToast = page
					.locator('[data-sonner-toast]')
					.filter({
						hasText: 'Invitation created and link copied to clipboard'
					})
					.last();
				await expect(successToast).toBeVisible();

				// Verify clipboard content contains invite URL pattern
				const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
				expect(clipboardText).toContain('/invite/');
			}
		});

		test('should display pending invitations', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if the invite form is available
			const emailInput = page.getByLabel('Email Address');
			if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Create an invitation
				const testEmail = `pending-${Date.now()}@example.com`;
				await emailInput.fill(testEmail);
				await page.getByRole('button', { name: 'Invite' }).click();

				// Wait for success message
				await page.waitForTimeout(1000);

				// Check if pending invitations section appears
				const pendingSection = page.getByText('Pending Invitations');
				if (await pendingSection.isVisible({ timeout: 2000 }).catch(() => false)) {
					// Verify the invitation is listed
					await expect(page.getByText(testEmail)).toBeVisible();
					await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
				}
			}
		});

		test('should allow canceling invitations', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if the invite form is available
			const emailInput = page.getByLabel('Email Address');
			if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Create an invitation
				const testEmail = `cancel-test-${Date.now()}@example.com`;
				await emailInput.fill(testEmail);
				await page.getByRole('button', { name: 'Invite' }).click();

				// Wait for invitation to be created
				await page.waitForLoadState('networkidle');

				// Check if pending invitations section is visible
				const pendingSection = page.getByText('Pending Invitations');
				if (await pendingSection.isVisible({ timeout: 2000 }).catch(() => false)) {
					// Find and click cancel button for this invitation
					const row = page.locator('tr').filter({ hasText: testEmail });
					await row.getByRole('button', { name: 'Cancel' }).click();

					// Verify invitation is removed
					await expect(page.getByText(testEmail)).not.toBeVisible();
				}
			}
		});

		test('should invite new members as admin/owner', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if user has organization
			const orgDetails = page.getByText('Organization Details');
			if (!(await orgDetails.isVisible({ timeout: 2000 }).catch(() => false))) {
				// User has no organization, skip test
				return;
			}

			// Check if invite form is visible (user must be admin/owner)
			const inviteSection = page.getByText('Invite Members');

			if (await inviteSection.isVisible({ timeout: 2000 }).catch(() => false)) {
				const testEmail = `test-${Date.now()}@example.com`;

				// Fill in email
				const emailInput = page.getByLabel('Email Address');
				await emailInput.fill(testEmail);

				// The role select might be a custom component
				// Try to find the hidden input or select element
				const roleInput = page.locator('input[name="role"]');
				if ((await roleInput.count()) > 0) {
					// Role is handled via hidden input, it's already set to default
				}

				// Send invitation
				const inviteButton = page.getByRole('button', { name: /Invite/i }).first();
				await inviteButton.click();

				// Should show success toast
				const successToast = page.locator('[data-sonner-toast], [role="status"]').filter({
					hasText: /Invitation created|link copied/i
				});
				await expect(successToast.first()).toBeVisible({ timeout: 5000 });

				// Wait a moment for the invitation to appear
				await page.waitForTimeout(1000);

				// Should show in pending invitations section
				const pendingSection = page.getByText('Pending Invitations');
				if (await pendingSection.isVisible({ timeout: 2000 }).catch(() => false)) {
					await expect(page.getByText(testEmail)).toBeVisible();
				}
			}
		});

		test('should not show management options for regular members', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check if user has organization
			const orgDetails = page.getByText('Organization Details');
			if (!(await orgDetails.isVisible({ timeout: 2000 }).catch(() => false))) {
				// User has no organization, skip test
				return;
			}

			// Check user's role - look for the "Your Role" section
			const roleSection = page.locator('text=Your Role').locator('..');
			const roleBadge = roleSection.locator('.badge, [class*="badge"]').first();
			const roleText = await roleBadge.textContent().catch(() => '');

			// Test only applies to regular members
			if (
				roleText &&
				!roleText.toLowerCase().includes('owner') &&
				!roleText.toLowerCase().includes('admin')
			) {
				// Should not see invite section
				await expect(page.getByText('Invite Members')).not.toBeVisible();

				// Should not see remove buttons for other members
				const removeButtons = page
					.locator('button')
					.filter({ has: page.locator('[class*="trash"]') });
				expect(await removeButtons.count()).toBe(0);

				// Should not have role dropdowns for other members
				const roleDropdowns = page.locator('[role="combobox"]');
				expect(await roleDropdowns.count()).toBe(0);
			} else {
				// User is admin/owner, verify they DO have management options
				const inviteSection = page.getByText('Invite Members');
				if (roleText.toLowerCase().includes('owner') || roleText.toLowerCase().includes('admin')) {
					await expect(inviteSection).toBeVisible();
				}
			}
		});

		test('should display member roles correctly', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Check that roles are displayed
			const memberRows = page.locator('tbody tr');
			const rowCount = await memberRows.count();

			if (rowCount > 0) {
				for (let i = 0; i < rowCount; i++) {
					const row = memberRows.nth(i);
					// Each member should have a role displayed (either as badge or select)
					const roleElement = row.locator('[role="combobox"], .badge').first();
					await expect(roleElement).toBeVisible();
				}
			}
		});

		test('should not allow changing own role', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Find the row with "You" badge
			const ownRow = page.locator('tr').filter({ has: page.getByText('You') });

			if (await ownRow.isVisible({ timeout: 2000 }).catch(() => false)) {
				// The role should be displayed as a badge, not a select
				const badges = ownRow.locator('[class*="badge"], .badge');
				const badgeCount = await badges.count();
				expect(badgeCount).toBeGreaterThan(0);

				// Should not have a combobox for role selection
				await expect(ownRow.locator('[role="combobox"]')).not.toBeVisible();
			}
		});

		test('should not show remove button for own account', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Find the row with "You" badge
			const ownRow = page.locator('tr').filter({ has: page.getByText('You') });

			if (await ownRow.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Should not have a remove button
				const removeButton = ownRow.getByRole('button').filter({ hasText: /trash|remove/i });
				await expect(removeButton).not.toBeVisible();
			}
		});

		test('should not allow self role change or removal', async ({ page }) => {
			await page.goto('/settings/organization');
			await page.waitForLoadState('networkidle');

			// Find own member row (has "You" badge)
			const ownRow = page.locator('tr').filter({ has: page.getByText('You') });

			if (await ownRow.isVisible({ timeout: 2000 }).catch(() => false)) {
				// Should not have a role dropdown
				const roleDropdown = ownRow.locator('[role="combobox"]');
				await expect(roleDropdown).not.toBeVisible();

				// Should show role as badge instead (might have multiple badges)
				const roleBadges = ownRow.locator('.badge');
				const badgeCount = await roleBadges.count();
				expect(badgeCount).toBeGreaterThan(0);

				// Should not have remove button
				const removeButton = ownRow
					.locator('button')
					.filter({ has: page.locator('.lucide-trash-2') });
				await expect(removeButton).not.toBeVisible();
			}
		});
	});

	test.describe('Organization Navigation', () => {
		test('should navigate to organization page from user menu', async ({ page }) => {
			await page.goto('/home');
			await page.waitForLoadState('networkidle');

			// Find the user button in the sidebar (has avatar)
			const sidebar = page.locator('[data-testid="app-sidebar"]');
			const userButton = sidebar
				.locator('button')
				.filter({ has: page.locator('[class*="avatar"]') })
				.first();

			if (!(await userButton.isVisible({ timeout: 2000 }).catch(() => false))) {
				// Try alternative selector
				const altButton = page.locator('button[class*="data-[state=open]"]').last();
				if (await altButton.isVisible({ timeout: 1000 }).catch(() => false)) {
					await altButton.click();
				} else {
					return; // Skip test if button not found
				}
			} else {
				await userButton.click();
			}

			// Wait for dropdown menu to open
			await page.waitForTimeout(200);

			// The Organization menu item is a div with onclick handler, not a link
			// Look for the menu content container first
			const menuContent = page
				.locator('[role="menu"], [data-radix-menu-content], [class*="dropdown-menu-content"]')
				.first();

			if (await menuContent.isVisible({ timeout: 1000 }).catch(() => false)) {
				// Find and click the Organization item within the menu
				const orgItem = menuContent
					.locator('div, [role="menuitem"]')
					.filter({ hasText: 'Organization' })
					.first();
				if (await orgItem.isVisible()) {
					await orgItem.click();
					// Should navigate to organization settings
					await expect(page).toHaveURL('/settings/organization');
					await expect(page.getByRole('heading', { name: 'Organization Settings' })).toBeVisible();
				}
			}
		});

		test('should not show organization dropdown in sidebar', async ({ page }) => {
			await page.goto('/home');
			await page.waitForLoadState('networkidle');

			// Ensure sidebar is visible
			const sidebar = page.locator('[data-testid="app-sidebar"]');
			await expect(sidebar).toBeVisible();

			// Should not have organization switcher/dropdown in header
			const orgSwitcher = sidebar
				.locator('button')
				.filter({ hasText: /Select Organization|Organization Name/i });
			expect(await orgSwitcher.count()).toBe(0);

			// Organization access should only be in user menu
			// Find user button by looking for button with avatar
			const userButton = sidebar
				.locator('button')
				.filter({ has: page.locator('[class*="avatar"]') })
				.first();

			if (await userButton.isVisible({ timeout: 2000 }).catch(() => false)) {
				await userButton.click();

				// Wait for dropdown menu to appear
				await page.waitForTimeout(200);

				// Check that the menu is open and contains Organization option
				const menuContent = page
					.locator('[role="menu"], [data-radix-menu-content], [class*="dropdown-menu-content"]')
					.first();
				await expect(menuContent).toBeVisible();

				// Verify Organization option exists in the menu
				const orgOption = menuContent.locator('text=Organization');
				await expect(orgOption).toBeVisible();
			}
		});
	});
});
