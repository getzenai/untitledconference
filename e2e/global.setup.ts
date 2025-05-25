import { test as setup } from '@playwright/test';
import 'dotenv/config'; // Ensure .env variables are loaded for this script, if db access needs them
import { testUserManager } from './test-user-manager';

// This global setup cleans the database and resets the user manager state.
setup('global setup: clean DB', async () => {
	console.log('[Global Setup] Cleaning test users and resetting API user manager...');

	// Clean all test users from database
	await testUserManager.cleanupAllTestUsers();

	// Reset user manager state for fresh test run
	testUserManager.reset();

	console.log('[Global Setup] Test users cleaned and API user manager reset.');
});
