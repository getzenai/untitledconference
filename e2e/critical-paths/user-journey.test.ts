import { createLogger } from '../../src/lib/server/logger';
import { CrudActions } from '../actions/crud.actions';
import { expect, test } from '../fixtures/test';
import { testUserManager } from '../test-user-manager';

const logger = createLogger('UserJourneyTest');

/**
 * Critical User Journey Test
 *
 * This comprehensive E2E test covers the complete user journey that demonstrates
 * the integration between all major features of the application. It replaces
 * multiple scattered tests and validates the core user experience.
 *
 * Target Execution Time: ~30 seconds
 */
test.describe('Critical User Journey', () => {
	test.fixme(
		'Core user workflow: Register → Create Org → Create Item → Logout → Login',
		async ({ page, registerPage, loginPage, homePage, organizationPage, crudPage }) => {
			// Increase timeout for this comprehensive test (it does a lot of work)
			test.setTimeout(30000); // 30 seconds instead of default 5 seconds
			const timestamp = Date.now();

			// Generate unique test data for this test run
			const userEmail = testUserManager.generateTestUserEmail(`journey-${timestamp}`);
			const organizationName = `Test Org Journey ${timestamp}`;
			const crudItemName = `Journey Test Item ${timestamp}`;
			const password = 'JourneyTest123!';

			// Initialize action helpers
			const crudActions = new CrudActions(page);

			logger.debug('STEP 1: Register User');
			await registerPage.goto();
			await registerPage.registerAndWaitForRedirect(
				userEmail,
				password,
				password,
				organizationName,
				'/home'
			);

			// Verify successful registration and organization creation
			expect(await homePage.isLoggedIn()).toBeTruthy();
			expect(page.url()).toContain('/home');

			logger.debug('STEP 2: Verify Organization Access');
			await organizationPage.goto();
			await organizationPage.waitForPageLoad();
			expect(await organizationPage.isOrganizationPageVisible()).toBeTruthy();

			logger.debug('STEP 3: Create CRUD Item');
			await crudActions.navigateToCrudPage();
			await crudActions.createExampleObject(crudItemName, 'Core journey test description');
			await crudActions.verifyObjectExists(crudItemName);

			logger.debug('STEP 4: Logout User');
			await homePage.goto();
			await homePage.logout();
			expect(page.url()).toContain('/login');

			logger.debug('STEP 5: Login User Again');
			await loginPage.loginAndWaitForRedirect(userEmail, password, '/home');
			expect(await homePage.isLoggedIn()).toBeTruthy();

			logger.debug('STEP 6: Verify Item Still Exists');
			await crudActions.navigateToCrudPage();
			// Wait for page to fully load before verification
			await page.waitForLoadState('networkidle');
			await crudActions.verifyObjectExists(crudItemName);

			logger.debug('FINAL VERIFICATION');
			// Ensure we're on the correct page and wait for it to be stable
			expect(page.url()).toContain('/examples/crud');
			await page.waitForLoadState('networkidle');

			// Verify we can access the CRUD item (confirms user is logged in and has access)
			await page.waitForTimeout(500); // Brief wait for any final UI updates
			expect(await crudPage.isItemVisible(crudItemName)).toBeTruthy();

			// Verify CRUD functionality is available (confirms authenticated state)
			expect(await crudPage.isCreateButtonVisible()).toBeTruthy();

			logger.debug('Core user journey test passed successfully');
		}
	);

	test.fixme(
		'Basic owner workflow validation',
		async ({ page, registerPage, homePage, organizationPage, crudPage }) => {
			const timestamp = Date.now();

			// Generate unique test data
			const ownerEmail = testUserManager.generateTestUserEmail(`simple-owner-${timestamp}`);
			const organizationName = `Simple Org ${timestamp}`;
			const password = 'SimpleTest123!';
			const itemName = `Simple Item ${timestamp}`;

			logger.debug('Basic Journey: Register and Create');

			// Register owner with organization
			await registerPage.goto();
			await registerPage.registerAndWaitForRedirect(
				ownerEmail,
				password,
				password,
				organizationName
			);

			// Verify basic functionality
			expect(await homePage.isLoggedIn()).toBeTruthy();

			// Verify organization access
			await organizationPage.goto();
			await organizationPage.waitForPageLoad();
			expect(await organizationPage.isOrganizationPageVisible()).toBeTruthy();

			// Create a test item to validate CRUD functionality
			await crudPage.goto();
			await crudPage.waitForPageLoad();

			const crudActions = new CrudActions(page);
			await crudActions.createExampleObject(itemName, 'Basic test description');
			await crudActions.verifyObjectExists(itemName);

			logger.debug('Basic user journey completed successfully');
		}
	);
});
