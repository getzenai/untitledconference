import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Load .env.e2e file for e2e test configuration
config({ path: '.env.e2e' });

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview -- --port 5174',
		port: 5174, // E2E tests use their own port
		reuseExistingServer: false, // Always use fresh server for tests
		env: {
			BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5174',
			NODE_ENV: 'test',
			PLAYWRIGHT_TEST: 'true',
			DATABASE_URL: process.env.DATABASE_URL
		}
	},
	timeout: 5 * 1000, // 5 seconds
	expect: {
		timeout: 5 * 1000 // 5 seconds
	},
	projects: [
		{
			name: 'setup db', // Runs global.setup.ts (cleans DB)
			testMatch: /global\.setup\.ts/,
			teardown: 'cleanup db' // global.teardown.ts will run after all tests that depend on 'setup db'
		},
		{
			name: 'cleanup db', // Project for teardown
			testMatch: /global\.teardown\.ts/
		},
		{
			name: 'setup auth', // Runs auth.setup.ts (creates and logs in test user via API)
			testMatch: /auth\.setup\.ts/,
			dependencies: ['setup db'] // Depends on DB being clean
		},
		{
			name: 'authenticated',
			dependencies: ['setup auth'],
			testDir: './e2e/authenticated',
			use: {
				storageState: 'e2e/.auth/user.json'
			}
		},
		{
			name: 'unauthenticated',
			dependencies: ['setup db'],
			testDir: './e2e/unauthenticated'
		}
	],
	use: {
		baseURL: 'http://localhost:5174', // Tests navigate to this URL
		trace: 'on-first-retry'
	},
	reporter: [['html', { outputFolder: 'playwright-report' }]]
});
