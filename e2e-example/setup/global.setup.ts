import { test as setup } from '@playwright/test';
import { client } from '../helpers/db-client'; // Import client from db-client

setup('clean test users before tests', async () => {
	try {
		// Check DB connection first
		await client`select 1`;
		console.log('DB connection successful for global setup.');
		// Removed cleanupTestUsers() call - user cleanup handled by fixtures or global teardown
	} catch (error) {
		console.error(
			'🔴 DB connection failed during global setup. Skipping cleanup. Please ensure the database is running and accessible.',
			error
		);
		// Re-throw the error to make the setup fail if DB is unavailable
		throw new Error(`Database connection failed during global setup: ${error}`);
	} finally {
		// Ensure the client connection is closed if opened implicitly by the check
		// await client.end(); // postgres-js usually manages connections automatically, might not be needed - client.end() might be needed if connection isn't implicitly closed
	}
});
