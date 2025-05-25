import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/lib/server/db/auth-schema.ts'; // Updated to new schema file

// Use a fixed connection string for e2e tests
const connectionString = 'postgres://root:mysecretpassword@localhost:5432/local';
export const client = postgres(connectionString); // Export client for connection checks
export const db = drizzle(client, { schema });

// Test-specific helper functions have been moved to test-db-utils.ts
