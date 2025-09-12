import { test as setup } from '@playwright/test';
import { execSync } from 'child_process';
import 'dotenv/config'; // Ensure .env variables are loaded for this script, if db access needs them
import { testUserManager } from './test-user-manager';

// This global setup pushes the database schema, cleans the database, and resets the user manager state.
setup('global setup: clean DB', async () => {
	// Push database schema using test database
	console.log('Pushing database schema to test database...');
	execSync('npx drizzle-kit push --force', {
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: process.env.TEST_DATABASE_URL
		}
	});

	// Clean all test users from database
	await testUserManager.cleanupAllTestUsers();

	// Reset user manager state for fresh test run
	testUserManager.reset();
});
