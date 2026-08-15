/**
 * The close half of the request scope, which needs a real connection to mean
 * anything — the unit tests beside this file can only cover the case where none
 * was ever opened.
 *
 * What is actually at stake: a scope that opens a connection and never hands it
 * back leaks one per request, and a scope that opens a second connection for the
 * second query pays a TLS handshake it does not need. Neither shows up as a
 * failing query, so only a test that counts them will notice.
 */
import { bindRequestScopedDb, db, withRequestScopedDb } from '$lib/server/db';
import { holdUntilResponseComplete } from '$lib/server/db/response-hold';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('withRequestScopedDb, with a connection open', () => {
	it('hands back exactly one closing promise, and it resolves', async () => {
		const closings: Promise<void>[] = [];

		await withRequestScopedDb(
			async () => {
				await db.execute(sql`select 1`);
			},
			(closing) => closings.push(closing)
		);

		expect(closings).toHaveLength(1);
		await expect(closings[0]).resolves.toBeUndefined();
	});

	it('reuses one connection across several queries in the same scope', async () => {
		const closings: Promise<void>[] = [];

		await withRequestScopedDb(
			async () => {
				await db.execute(sql`select 1`);
				await db.execute(sql`select 2`);
				await db.execute(sql`select 3`);
			},
			(closing) => closings.push(closing)
		);

		// One close means one connection. Three would mean every query on a page
		// paid its own handshake.
		expect(closings).toHaveLength(1);
		await closings[0];
	});

	it('still closes when the request throws', async () => {
		const closings: Promise<void>[] = [];

		await expect(
			withRequestScopedDb(
				async () => {
					await db.execute(sql`select 1`);
					throw new Error('boom');
				},
				(closing) => closings.push(closing)
			)
		).rejects.toThrow('boom');

		// A failed request must not keep a socket. This is the leak that would only
		// be visible as connection exhaustion, hours later, under load.
		expect(closings).toHaveLength(1);
		await expect(closings[0]).resolves.toBeUndefined();
	});
});

/**
 * The regression behind #684: the connection used to close when the response
 * *object* existed, not when the response was finished. Everything a streamed
 * body still had to do — a chat calling its tools — queried against a socket
 * that was already gone, and the model turned the failure into a confident
 * wrong answer.
 */
describe('a response whose body is still streaming', () => {
	it('keeps its connection until the body ends, and queries in between', async () => {
		const closings: Promise<void>[] = [];
		let closed = false;
		let streamedQuery: unknown;

		const response = await withRequestScopedDb(
			async () => {
				// The queries a request runs before its headers go out: session,
				// loads, guards.
				await db.execute(sql`select 1`);

				// The producer runs later, driven by whoever reads the body — the
				// runtime, not this promise chain. `bindRequestScopedDb` is what
				// puts it back inside the scope.
				const query = bindRequestScopedDb(() => db.execute(sql`select 2 as answer`));
				const stream = new ReadableStream({
					async pull(controller) {
						streamedQuery = await query();
						controller.enqueue(new TextEncoder().encode('done'));
						controller.close();
					}
				});

				return holdUntilResponseComplete(new Response(stream));
			},
			(closing) => {
				closings.push(closing);
				void closing.then(() => {
					closed = true;
				});
			}
		);

		// The close was handed over immediately, exactly as `waitUntil` takes it,
		// and it is deliberately still pending.
		expect(closings).toHaveLength(1);
		await Promise.resolve();
		expect(closed).toBe(false);

		await expect(response.text()).resolves.toBe('done');
		expect(streamedQuery).toEqual([{ answer: 2 }]);

		await closings[0];
		expect(closed).toBe(true);
	});

	it('releases the connection when the body errors mid-stream', async () => {
		const closings: Promise<void>[] = [];

		const response = await withRequestScopedDb(
			async () => {
				await db.execute(sql`select 1`);
				const stream = new ReadableStream({
					pull() {
						throw new Error('the model hung up');
					}
				});
				return holdUntilResponseComplete(new Response(stream));
			},
			(closing) => closings.push(closing)
		);

		// A failed stream is the case most likely to leak: nobody is waiting for
		// it, so nothing else would ever release the socket.
		await expect(response.text()).rejects.toThrow('the model hung up');
		await expect(closings[0]).resolves.toBeUndefined();
	});

	it('releases the connection when the client hangs up mid-body', async () => {
		const closings: Promise<void>[] = [];

		const response = await withRequestScopedDb(
			async () => {
				await db.execute(sql`select 1`);
				const stream = new ReadableStream({
					pull(controller) {
						controller.enqueue(new TextEncoder().encode('chunk'));
					}
				});
				return holdUntilResponseComplete(new Response(stream));
			},
			(closing) => closings.push(closing)
		);

		// An abandoned download must not hold a socket open forever — that would
		// trade the old bug for a leak.
		await response.body!.cancel('client left');
		await expect(closings[0]).resolves.toBeUndefined();
	});
});
