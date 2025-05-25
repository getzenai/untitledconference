import { test as teardown } from '@playwright/test';
import { testUserManager } from './test-user-manager';

teardown('clean test users after tests', async () => {
	console.log('[Global Teardown] Cleaning up all test users...');

	// Clean up any users created during test execution
	await testUserManager.cleanupCreatedUsers();

	// Clean up all test users as final step
	await testUserManager.cleanupAllTestUsers();

	console.log('[Global Teardown] Test user cleanup completed.');
});
