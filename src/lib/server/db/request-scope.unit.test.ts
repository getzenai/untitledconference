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
import { needsRequestScopedDb, withRequestScopedDb } from './index';

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
});
