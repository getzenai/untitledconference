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
import { db, withRequestScopedDb } from '$lib/server/db';
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
