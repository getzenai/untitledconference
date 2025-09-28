import { createLogger } from '../../src/lib/server/logger';
import { expect, test } from '../fixtures/test';
import { CrudPage } from '../pages/crud.page';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { testUserManager } from '../test-user-manager';

const logger = createLogger('LoginWorkflowTest');

/**
 * Critical Login Workflow Test
 *
 * This E2E test covers the essential login workflow that demonstrates
 * user authentication and access to protected functionality.
 *
 * Target Execution Time: ~10 seconds
 */
test.describe('Critical Login Workflow', () => {
	test('Login → Navigate → Perform Protected Action', async ({ browser }) => {
		// Create a fresh, non-authenticated context for login testing
		const context = await browser.newContext();
		const page = await context.newPage();

		// Create page objects with fresh page
		const loginPage = new LoginPage(page);
		const homePage = new HomePage(page);
		const crudPage = new CrudPage(page);

		const timestamp = Date.now();

		// Create a test user first
		const testUser = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail(`login-workflow-${timestamp}`),
			password: 'LoginTest123!'
		});

		logger.debug('STEP 1: Login User');
		await loginPage.goto();
		await loginPage.loginAndWaitForRedirect(testUser.email, testUser.password, '/home');

		// Verify successful login
		expect(await homePage.isLoggedIn()).toBeTruthy();
		expect(page.url()).toContain('/home');

		logger.debug('STEP 2: Navigate to Protected Content');
		await crudPage.goto();
		await crudPage.waitForPageLoad();

		// Verify access to protected functionality
		expect(await crudPage.isCreateButtonVisible()).toBeTruthy();
		expect(page.url()).toContain('/examples/crud');

		logger.debug('STEP 3: Verify Protected Action');
		// Verify we can interact with protected content (CRUD page loads and is functional)
		// Check that we can see the "Existing Example Objects" text
		await expect(page.getByText('Existing Example Objects')).toBeVisible();

		logger.debug('Critical login workflow completed successfully');

		// Clean up
		await context.close();
	});
});
