import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'e2e',
	projects: [
		{
			name: 'setup db',
			testMatch: /global\.setup\.ts/,
			teardown: 'cleanup db'
		},
		{
			name: 'cleanup db',
			testMatch: /global\.teardown\.ts/
		},
		{
			name: 'setup auth',
			testMatch: /auth\.setup\.ts/,
			dependencies: ['setup db']
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
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	}
});
