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

const logger = createLogger('Database');

const schema = {
	...authSchema,
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

/**
 * Opens a connection, preferring an address the caller was handed.
 *
 * `override` is Hyperdrive's `connectionString` when a Worker request supplied
 * one — see `withRequestScopedDb`. Everywhere else it is absent and the
 * environment's `DATABASE_URL` stands, which is what keeps Node, tests and
 * scripts on the path they have always used.
 */
function connect(override?: string): Connection {
	const url = override ?? serverEnv().DATABASE_URL;
	logger.debug('Opening database connection', {
		url: url.replace(/:([^@]+)@/, ':****@'),
		viaHyperdrive: override !== undefined
	});

	// `max: 1` — nothing here benefits from a pool. On a Worker the client lives
	// for a single request, so a pool would only mean several sockets and several
	// TLS handshakes for one page; in Node the pool is fronted by a pooler anyway.
	//
	// `prepare: false` — required, not defensive, and for the same reason on both
	// addresses: `DATABASE_URL` points at Neon's `-pooler` endpoint and Hyperdrive
	// pools in front of the direct one. Either way a named prepared statement does
	// not survive the next query landing on a different backend.
	//
	// `scripts/db/migrate.mjs` connects with the same two options.
	const client = postgres(url, { max: 1, prepare: false });
	return { client, db: drizzle(client, { schema }) };
}

/**
 * The per-request connection, when there is one, and the address to open it at.
 *
 * `connection` is empty on entry: it is opened on the request's first query, so
 * a request that never touches the database never opens one. `connectionString`
 * is set on entry when the request arrived with a Hyperdrive binding.
 */
const requestScope = new AsyncLocalStorage<{
	connection?: Connection;
	connectionString?: string;
	/** Work that must finish before the connection may be closed — see `holdRequestScopedDb`. */
	holds: Promise<unknown>[];
}>();

/** Process-wide fallback for Node contexts — tests, scripts, the job worker. */
let processConnection: Connection | undefined;

/**
 * Workers set `navigator.userAgent` to this. It is a property of the runtime
 * rather than of the request, which is what makes it usable here: `resolveDb`
 * is reached from places that have no `platform` to inspect.
 */
const ON_WORKER = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

function resolveDb(): Db {
	const store = requestScope.getStore();
	if (store) {
		store.connection ??= connect(store.connectionString);
		return store.connection.db;
	}

	// Falling through to the process-wide client on a Worker is the bug this
	// module exists to prevent, and it fails *intermittently* — the first query
	// on a fresh isolate succeeds, so a silent fallback would look like it
	// worked and then serve 500s once the isolate is reused. Refusing loudly
	// here turns that into one obvious failure at the call site instead. A
	// scheduled handler or a `waitUntil` task that queries needs its own scope;
	// `withRequestScopedDb` is what gives it one.
	if (ON_WORKER) {
		throw new Error(
			'No request-scoped database connection. On Cloudflare Workers every query must run ' +
				'inside withRequestScopedDb() — a connection cannot be shared between requests.'
		);
	}

	processConnection ??= connect();
	return processConnection.db;
}

/**
 * Keeps the current request's connection open until `work` settles.
 *
 * A streamed response finishes long after its headers do, and the work that
 * fills it — a chat calling tools, say — queries in between. Without a hold,
 * the connection is closed the moment the Response object exists and every one
 * of those queries fails (#684). A hold is a promise the close waits for.
 *
 * Outside a request scope this is a no-op: the process-wide client is not
 * closed per request, so there is nothing to hold open.
 */
export function holdRequestScopedDb(work: Promise<unknown>): void {
	requestScope.getStore()?.holds.push(work);
}

/**
 * Re-enters the current request's database scope every time `fn` is called.
 *
 * `AsyncLocalStorage` follows the promise chain a request already started; it
 * does not follow a callback the runtime invokes later on its own, which is
 * exactly how a stream's producer runs. Binding at creation time captures the
 * scope while it is still current, so a tool executed while the body streams
 * still finds the request's connection instead of throwing (#684).
 */
export function bindRequestScopedDb<Args extends unknown[], Result>(
	fn: (...args: Args) => Result
): (...args: Args) => Result {
	const store = requestScope.getStore();
	if (!store) return fn;
	return (...args: Args) => requestScope.run(store, () => fn(...args));
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
	defer: (closing: Promise<void>) => void,
	connectionString?: string
): Promise<T> {
	const store: {
		connection?: Connection;
		connectionString?: string;
		holds: Promise<unknown>[];
	} = { connectionString, holds: [] };
	try {
		return await requestScope.run(store, fn);
	} finally {
		// `end()` waits for queries already in flight, so no query that has started
		// is cut short.
		//
		// `fn` resolves when the Response is returned, not when its body is
		// finished, so anything still producing that body gets a hold
		// (`holdRequestScopedDb`) and the close waits for it. A hold that rejects
		// still releases the connection — `allSettled`, because a failed stream
		// must not leak a socket.
		if (store.connection) {
			const connection = store.connection;
			// Snapshot: a hold registered after `fn` resolved would not be waited
			// for. Everything that holds does so from inside the request, which is
			// the only place a scope exists to hold.
			const held =
				store.holds.length > 0 ? Promise.allSettled(store.holds) : Promise.resolve(undefined);
			defer(held.then(() => connection.client.end()));
		}
	}
}

/**
 * True when this process must scope connections to a single request.
 *
 * `platform.ctx` is supplied by `adapter-cloudflare` and by nothing else, so its
 * presence is the same question as "am I running on a Worker" — and it is the
 * very thing we need from the platform, rather than a proxy for it.
 */
/**
 * The address the current request would open a connection at, or undefined for
 * the environment's own `DATABASE_URL`.
 *
 * Exists so the Hyperdrive hand-off can be asserted without opening a socket:
 * this reads exactly the field `resolveDb` reads.
 */
export function readScopedConnectionString(): string | undefined {
	return requestScope.getStore()?.connectionString;
}

export function needsRequestScopedDb(platform: App.Platform | undefined): boolean {
	return typeof platform?.ctx?.waitUntil === 'function';
}

export const db = new Proxy({} as Db, {
	get(target, prop, receiver) {
		return Reflect.get(resolveDb(), prop, receiver);
	}
});
