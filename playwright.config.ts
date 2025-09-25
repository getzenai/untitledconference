import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Load main .env file which now contains TEST_DATABASE_URL
config();

export default defineConfig({
	workers: 4, // Increase worker count for faster test execution
	fullyParallel: true, // Run all tests in parallel for maximum speed
	webServer: {
		command: 'npm run build && npm run preview -- --port 5174',
		// important: do not change this, we want a seperated dev server for E2E tests that uses its own database
		// if the dev server is used it will lead to test failures
		port: 5174, // E2E tests use their own port
		reuseExistingServer: false, // Always use fresh server for tests
		env: {
			BETTER_AUTH_URL: 'http://localhost:5174',
			NODE_ENV: 'test',
			PLAYWRIGHT_TEST: 'true',
			DATABASE_URL: process.env.TEST_DATABASE_URL, // Use TEST_DATABASE_URL for tests, no fallback
			REQUIRE_EMAIL_VERIFICATION: 'false', // Skip verification in E2E runs
			ENABLE_TEST_ENDPOINTS: 'true'
		}
	},
	timeout: 30 * 1000, // 30 seconds for overall test execution
	actionTimeout: 1000, // 1 second for all actions (click, fill, etc.)
	navigationTimeout: 5000, // 5 seconds for page navigation
	expect: {
		timeout: 1000 // 1 second for all assertions (toBeVisible, etc.)
	},
	use: {
		// Set default timeout for all test operations
		// This affects page.waitForSelector, locator.waitFor, etc.
		actionTimeout: 1000,
		navigationTimeout: 5000,
		// Keep screenshots and traces for debugging, but no video
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	testDir: './e2e',
	projects: [
		{
			name: 'setup db', // Runs global.setup.ts (cleans DB)
			testMatch: /global\.setup\.ts/,
			teardown: 'cleanup db', // global.teardown.ts will run after all tests that depend on 'setup db'
			fullyParallel: false // Setup/teardown should not run in parallel
		},
		{
			name: 'cleanup db', // Project for teardown
			testMatch: /global\.teardown\.ts/,
			fullyParallel: false // Setup/teardown should not run in parallel
		},
		{
			name: 'setup auth', // Runs auth.setup.ts (creates and logs in test user via API)
			testMatch: /auth\.setup\.ts/,
			dependencies: ['setup db'], // Depends on DB being clean
			fullyParallel: false // Setup should not run in parallel
		},
		{
			name: 'critical-paths',
			dependencies: ['setup db'], // Each test creates its own isolated user
			testDir: './e2e/critical-paths',
			testMatch: '**/*.test.ts',
			fullyParallel: true, // Run all critical path tests in parallel
			use: {
				// Each test handles its own auth with isolated users
				// No shared storageState - better test isolation
			}
		},
		{
			name: 'critical-unauthenticated',
			dependencies: ['setup db'],
			testDir: './e2e/critical-paths',
			testMatch: '**/login-workflow.test.ts' // Only tests that need unauthenticated state
		}
	],
	use: {
		baseURL: 'http://localhost:5174', // Tests navigate to dev server
		trace: 'on-first-retry',
		screenshot: 'only-on-failure' // This is what actually enables screenshots
	},
	reporter: [
		[
			'@zenai/playwright-coding-agent-reporter',
			{
				includeScreenshots: true,
				includeConsoleErrors: true,
				includeNetworkErrors: true,
				silent: false,
				singleReportFile: true,
				capturePageState: true
			}
		]
	]
});
