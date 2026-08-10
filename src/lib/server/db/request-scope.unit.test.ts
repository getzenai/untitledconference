/**
 * Pins the contract `hooks.server.ts` relies on to keep a Worker's database
 * connection inside one request.
 *
 * The bug this guards against cannot be reproduced here — it needs workerd, and
 * it presents as a connection opened by request N failing when request N+1
 * touches it. What *is* testable is the decision around it, and that decision is
 * where the regression would hide: scope on the wrong platforms and Node pays a
 * TLS handshake per request; scope on none and Cloudflare serves intermittent
 * 500s again.
 *
 * Deliberately no connection is opened anywhere below, which is itself one of
 * the assertions.
 */
import { describe, expect, it, vi } from 'vitest';
import { needsRequestScopedDb, readScopedConnectionString, withRequestScopedDb } from './index';

describe('needsRequestScopedDb', () => {
	it('is true only when the platform hands us a waitUntil', () => {
		expect(needsRequestScopedDb({ ctx: { waitUntil: () => {} } } as unknown as App.Platform)).toBe(
			true
		);
	});

	it('is false without a platform — `vite dev`, adapter-node, tests, scripts', () => {
		expect(needsRequestScopedDb(undefined)).toBe(false);
	});

	it('is false when a platform exists but exposes no execution context', () => {
		expect(needsRequestScopedDb({} as App.Platform)).toBe(false);
		// A `ctx` without `waitUntil` is the shape we could not defer the close
		// with, so it must not be mistaken for a Worker.
		expect(needsRequestScopedDb({ ctx: {} } as unknown as App.Platform)).toBe(false);
	});
});

describe('withRequestScopedDb', () => {
	it('returns the wrapped result', async () => {
		const defer = vi.fn();
		await expect(withRequestScopedDb(async () => 'response', defer)).resolves.toBe('response');
	});

	it('opens no connection for a request that never queries', async () => {
		const defer = vi.fn();
		await withRequestScopedDb(async () => 'response', defer);
		// Nothing to close means nothing was opened. A static asset or a redirect
		// must not cost a database connection.
		expect(defer).not.toHaveBeenCalled();
	});

	it('still leaves the scope when the request throws', async () => {
		const defer = vi.fn();
		await expect(
			withRequestScopedDb(async () => {
				throw new Error('boom');
			}, defer)
		).rejects.toThrow('boom');
		expect(defer).not.toHaveBeenCalled();
	});

	/**
	 * The Hyperdrive address, when one is handed in, has to reach the connection
	 * the request opens — that is the whole of #17. Asserting it without opening a
	 * socket means reading the scope from inside the request, which is exactly
	 * where `resolveDb` reads it.
	 */
	it('carries a supplied connection string into the request scope', async () => {
		const defer = vi.fn();
		let seen: string | undefined = 'not-read';

		await withRequestScopedDb(
			async () => {
				seen = readScopedConnectionString();
			},
			defer,
			'postgres://hyperdrive.local/db'
		);

		expect(seen).toBe('postgres://hyperdrive.local/db');
	});

	it('leaves the address undefined when no binding was supplied', async () => {
		const defer = vi.fn();
		let seen: string | undefined = 'not-read';

		// The fallback that keeps `vite dev`, the Node adapter and every script on
		// `DATABASE_URL`. If this ever returned a string, those would silently move
		// onto an address nobody configured for them.
		await withRequestScopedDb(async () => {
			seen = readScopedConnectionString();
		}, defer);

		expect(seen).toBeUndefined();
	});
});
