import { test as teardown } from '@playwright/test';
import { cleanupTestUsers } from './db';

teardown('clean test users after tests', async () => {
	await cleanupTestUsers();
});
