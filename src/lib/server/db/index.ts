import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import { createLogger } from '../logger';
import * as authSchema from './auth-schema';
import * as exampleSchema from './examples/crud-example-schema';

const logger = createLogger('Database');

let client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle> | undefined;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(target, prop, receiver) {
		if (!_db) {
			const sanitizedUrl = config.databaseUrl.replace(/:([^@]+)@/, ':****@');
			logger.info('Initializing database connection', { url: sanitizedUrl });
			client = postgres(config.databaseUrl);
			_db = drizzle(client, { schema: { ...authSchema, ...exampleSchema } });
		}
		return Reflect.get(_db, prop, receiver);
	}
});
