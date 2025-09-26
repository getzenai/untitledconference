import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createLogger } from '../logger';
import * as authSchema from './auth-schema';
import * as exampleSchema from './examples/crud-example-schema';

const logger = createLogger('Database');

let client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle> | undefined;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(target, prop, receiver) {
		if (!_db) {
			if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
			// Redact password from the connection string for logging
			const sanitizedUrl = env.DATABASE_URL.replace(/:([^@]+)@/, ':****@');
			logger.info('Initializing database connection', { url: sanitizedUrl });
			client = postgres(env.DATABASE_URL);
			_db = drizzle(client, { schema: { ...authSchema, ...exampleSchema } });
		}
		return Reflect.get(_db, prop, receiver);
	}
});
