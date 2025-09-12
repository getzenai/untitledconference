import { test as base, BrowserContext, Page } from '@playwright/test';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { CrudPage } from '../pages/crud.page';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { OrganizationPage } from '../pages/organization.page';
import { RegisterPage } from '../pages/register.page';
import { TestUser, testUserManager } from '../test-user-manager';

type PageObjects = {
	loginPage: LoginPage;
	homePage: HomePage;
	crudPage: CrudPage;
	organizationPage: OrganizationPage;
	registerPage: RegisterPage;
	adminDashboardPage: AdminDashboardPage;
};

type AuthenticatedFixtures = {
	authenticatedPage: Page;
	authenticatedUser: TestUser;
};

type AdminFixtures = {
	adminPage: Page;
	adminUser: TestUser;
};

type OrganizationFixtures = {
	organizationContext: {
		owner: TestUser;
		member: TestUser;
		organizationName: string;
	};
};

type FreshContextFixtures = {
	freshPage: Page;
};

type IsolatedTestFixtures = {
	testUser: TestUser;
	createUserContext: () => Promise<{ user: TestUser; context: BrowserContext; page: Page }>;
};

export const test = base.extend<
	PageObjects &
		AuthenticatedFixtures &
		AdminFixtures &
		OrganizationFixtures &
		FreshContextFixtures &
		IsolatedTestFixtures
>({
	loginPage: async ({ page }, use) => {
		await use(new LoginPage(page));
	},

	homePage: async ({ page }, use) => {
		await use(new HomePage(page));
	},

	crudPage: async ({ page }, use) => {
		await use(new CrudPage(page));
	},

	organizationPage: async ({ page }, use) => {
		await use(new OrganizationPage(page));
	},

	registerPage: async ({ page }, use) => {
		await use(new RegisterPage(page));
	},

	adminDashboardPage: async ({ page }, use) => {
		await use(new AdminDashboardPage(page));
	},

	authenticatedPage: async ({ page }, use) => {
		// The page is already authenticated via storageState from auth.setup.ts
		// for tests in the 'authenticated' project
		await use(page);
	},

	authenticatedUser: async ({ authenticatedPage }, use) => {
		const cookies = await authenticatedPage.context().cookies();
		const sessionCookie = cookies.find((c) => c.name === 'better-auth.session_token');

		const user: TestUser = {
			id: 'authenticated-user',
			email: testUserManager.generateTestUserEmail('auth-fixture'),
			password: 'password123',
			token: sessionCookie?.value
		};

		await use(user);
	},

	adminPage: async ({ browser }, use) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		const adminUser = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('admin'),
			password: 'admin123',
			organizationName: 'Admin Org'
		});

		const loginPage = new LoginPage(page);
		await loginPage.goto();
		await loginPage.login(adminUser.email, adminUser.password);
		await page.waitForURL('/home', { timeout: 15000 });

		await use(page);

		await context.close();
	},

	adminUser: async ({ adminPage }, use) => {
		const cookies = await adminPage.context().cookies();
		const sessionCookie = cookies.find((c) => c.name === 'better-auth.session_token');

		const user: TestUser = {
			id: 'admin-user',
			email: testUserManager.generateTestUserEmail('admin'),
			password: 'admin123',
			token: sessionCookie?.value
		};

		await use(user);
	},

	organizationContext: async ({ browser }, use) => {
		const ownerContext = await browser.newContext();
		await ownerContext.newPage();

		const organizationName = `Org-${Date.now()}`;

		const owner = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('owner'),
			password: 'owner123',
			organizationName
		});

		const member = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail('member'),
			password: 'member123'
		});

		await use({
			owner,
			member,
			organizationName
		});

		await ownerContext.close();
	},

	// NEW: Isolated user fixture - creates unique user per test
	// eslint-disable-next-line no-empty-pattern
	testUser: async ({}, use, testInfo) => {
		const uniqueId = `w${testInfo.parallelIndex}-t${Date.now()}`;

		const user = await testUserManager.createTestUser({
			email: testUserManager.generateTestUserEmail(uniqueId),
			password: 'Test123!',
			organizationName: `Test Org ${uniqueId}`
		});

		await use(user);

		// Cleanup after test
		await testUserManager.deleteUser(user.email);
	},

	// NEW: Override page to be pre-authenticated with testUser
	page: async ({ browser, testUser }, use) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		// Login via UI
		await page.goto('/login');
		// Wait for page to be fully loaded with JavaScript
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Email').fill(testUser.email);
		await page.getByLabel('Password').fill(testUser.password);
		await page.getByRole('button', { name: 'Login' }).click();
		await page.waitForURL('/home');

		await use(page);

		// Cleanup
		await page.close();
		await context.close();
	},

	// NEW: Factory for creating additional user contexts
	createUserContext: async ({ browser }, use) => {
		const additionalContexts: BrowserContext[] = [];

		await use(async () => {
			const uniqueId = `extra-${Date.now()}-${Math.random().toString(36).slice(2)}`;

			const user = await testUserManager.createTestUser({
				email: testUserManager.generateTestUserEmail(uniqueId),
				password: 'Test123!',
				organizationName: `Extra Org ${uniqueId}`
			});

			const context = await browser.newContext();
			const page = await context.newPage();

			// Login via UI
			await page.goto('/login');
			await page.getByLabel('Email').fill(user.email);
			await page.getByLabel('Password').fill(user.password);
			await page.getByRole('button', { name: 'Login' }).click();
			await page.waitForURL('/home');

			additionalContexts.push(context);

			return { user, context, page };
		});

		// Cleanup additional contexts
		for (const ctx of additionalContexts) {
			await ctx.close();
		}
	}
});

export { expect } from '@playwright/test';
