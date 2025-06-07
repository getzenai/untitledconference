import { defineConfig } from '@playwright/test';
import 'dotenv/config'; // Load .env file for Playwright config and webServer env

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview -- --port 5173',
		port: 5173, // Playwright waits for this port
		reuseExistingServer: false, // Do not run on dev server as the tests will fail there
		env: {
			BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
			NODE_ENV: 'test',
			PLAYWRIGHT_TEST: 'true'
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
		baseURL: 'http://localhost:5173', // Tests navigate to this URL
		trace: 'on-first-retry'
	}
});
