import { test as teardown } from '@playwright/test';
import { client } from '../helpers/db-client'; // Import client from db-client

teardown('clean test users after tests', async () => {
	try {
		// Check DB connection first
		await client`select 1`;
		console.log('DB connection successful for global teardown.');
		// Removed cleanupTestUsers() call - user cleanup handled by fixtures.
		// Optional: Could add a broader cleanup here for users older than X hours as a safety net.
	} catch (error) {
		console.error(
			'🔴 DB connection failed during global teardown. Skipping cleanup. Please ensure the database is running and accessible.',
			error
		);
		// Re-throw the error to make the teardown fail clearly if DB is unavailable
		throw new Error(`Database connection failed during global teardown: ${error}`);
	} finally {
		// Ensure the client connection is closed if needed
		// await client.end(); // postgres-js usually manages connections automatically - client.end() might be needed
	}
});
