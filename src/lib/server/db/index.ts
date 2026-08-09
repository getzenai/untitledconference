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
			// Driver defaults — a 10-connection pool with prepared statements on — are
			// wrong for a Worker. Note this connects to Postgres DIRECTLY: the
			// `HYPERDRIVE` binding in wrangler.jsonc is declared but nothing reads it,
			// so `DATABASE_URL` is the only path to the database at request time.
			//
			//  - `max: 1`. A Worker isolate is short-lived and cannot amortise a pool.
			//    On a cold isolate the driver would open a socket per concurrent query
			//    — the public layout fires four — each paying its own TLS handshake and
			//    each able to hit a connection limit or a suspended compute on its own.
			//    That is the shape of the bug this fixes: intermittent "Failed query"
			//    500s on the pages that query concurrently, while the single-query
			//    health endpoint beside them stayed green. One connection serialises
			//    them instead.
			//  - `prepare: false`. Named prepared statements do not survive a
			//    transaction-pooling endpoint handing the next query to a different
			//    backend. Harmless on a direct connection, required on a pooled one,
			//    and which one `DATABASE_URL` points at is a deploy-time decision this
			//    module cannot see.
			//
			// `scripts/db/migrate.mjs` already connects with the same two options.
			client = postgres(DATABASE_URL, { max: 1, prepare: false });
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
