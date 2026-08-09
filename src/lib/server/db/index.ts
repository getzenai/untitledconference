/**
 * The Drizzle client.
 *
 * `db` is a lazy Proxy so that importing it never opens a connection — `vite
 * build` runs without secrets, and a module-scope connection would abort it.
 *
 * Beyond laziness, there are two connection lifetimes here, and the difference
 * is not an optimisation — one of them is a correctness requirement:
 *
 *  - **On Cloudflare Workers, one client per request.** A Worker forbids using
 *    an I/O object created by one request from another request handler. A
 *    process-wide `postgres()` singleton caches its TCP socket, so the second
 *    request served by the same isolate reuses a socket it is not allowed to
 *    touch and fails instantly with "Cannot perform I/O on behalf of a
 *    different request", surfacing as a Drizzle `Failed query: select …`. That
 *    is intermittent by nature: it depends on whether the isolate is fresh, so
 *    it looks like a flaky page rather than a broken one.
 *  - **Everywhere else, one client per process.** Node keeps its pool across
 *    requests happily, and tests, `scripts/` and the job worker have no request
 *    scope at all. Paying a TLS handshake per request there would be a
 *    regression for no benefit.
 *
 * `databaseScope()` in `hooks.server.ts` establishes the per-request scope and
 * closes the client afterwards.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { AsyncLocalStorage } from 'node:async_hooks';
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

const schema = {
	...authSchema,
	...exampleSchema,
	...conferenceSchema,
	...cfpSchema,
	...reviewSchema,
	...programSchema,
	...contentSchema,
	...emailSchema
};

type Client = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle>;

/** A connection and its Drizzle wrapper, created together and discarded together. */
type Connection = { client: Client; db: Db };

function connect(): Connection {
	const { DATABASE_URL } = serverEnv();
	logger.debug('Opening database connection', {
		url: DATABASE_URL.replace(/:([^@]+)@/, ':****@')
	});

	// `max: 1` — nothing here benefits from a pool. On a Worker the client lives
	// for a single request, so a pool would only mean several sockets and several
	// TLS handshakes for one page; in Node the pool is fronted by a pooler anyway.
	//
	// `prepare: false` — required, not defensive: `DATABASE_URL` points at Neon's
	// `-pooler` endpoint, which pools in transaction mode. Named prepared
	// statements do not survive it handing the next query to a different backend.
	//
	// `scripts/db/migrate.mjs` connects with the same two options.
	const client = postgres(DATABASE_URL, { max: 1, prepare: false });
	return { client, db: drizzle(client, { schema }) };
}

/**
 * The per-request connection, when there is one.
 *
 * Empty on entry: the connection is opened on the request's first query, so a
 * request that never touches the database never opens one.
 */
const requestScope = new AsyncLocalStorage<{ connection?: Connection }>();

/** Process-wide fallback for Node contexts — tests, scripts, the job worker. */
let processConnection: Connection | undefined;

function resolveDb(): Db {
	const store = requestScope.getStore();
	if (store) {
		store.connection ??= connect();
		return store.connection.db;
	}

	processConnection ??= connect();
	return processConnection.db;
}

/**
 * Runs `fn` with a connection scoped to it, closing that connection afterwards.
 *
 * `close` is handed back rather than awaited internally so the caller can defer
 * it past the response — on Workers that is `waitUntil`, which keeps the socket
 * teardown off the request's critical path.
 */
export async function withRequestScopedDb<T>(
	fn: () => Promise<T>,
	defer: (closing: Promise<void>) => void
): Promise<T> {
	const store: { connection?: Connection } = {};
	try {
		return await requestScope.run(store, fn);
	} finally {
		// `end()` waits for queries already in flight, so this cannot cut short a
		// response that is still being assembled.
		if (store.connection) defer(store.connection.client.end());
	}
}

/**
 * True when this process must scope connections to a single request.
 *
 * `platform.ctx` is supplied by `adapter-cloudflare` and by nothing else, so its
 * presence is the same question as "am I running on a Worker" — and it is the
 * very thing we need from the platform, rather than a proxy for it.
 */
export function needsRequestScopedDb(platform: App.Platform | undefined): boolean {
	return typeof platform?.ctx?.waitUntil === 'function';
}

export const db = new Proxy({} as Db, {
	get(target, prop, receiver) {
		return Reflect.get(resolveDb(), prop, receiver);
	}
});
