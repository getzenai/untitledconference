import { test as setup } from '@playwright/test';
import { cleanupTestUsers } from './db';

setup('clean test users before tests', async () => {
	await cleanupTestUsers();
});
