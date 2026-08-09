import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '../env';
import { createLogger } from '../logger';
import * as authSchema from './auth-schema';
import * as cfpSchema from './conference/cfp-schema';
import * as conferenceSchema from './conference/conference-schema';
import * as contentSchema from './conference/content-schema';
import * as emailSchema from './conference/email-schema';
import * as programSchema from './conference/program-schema';
import * as reviewSchema from './conference/review-schema';
import * as exampleSchema from './examples/crud-example-schema';

const logger = createLogger('Database');

let client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle> | undefined;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
	get(target, prop, receiver) {
		if (!_db) {
			const { DATABASE_URL } = serverEnv();
			const sanitizedUrl = DATABASE_URL.replace(/:([^@]+)@/, ':****@');
			logger.info('Initializing database connection', { url: sanitizedUrl });
			client = postgres(DATABASE_URL);
			_db = drizzle(client, {
				schema: {
					...authSchema,
					...exampleSchema,
					...conferenceSchema,
					...cfpSchema,
					...reviewSchema,
					...programSchema,
					...contentSchema,
					...emailSchema
				}
			});
		}
		return Reflect.get(_db, prop, receiver);
	}
});
