/**
 * The wrapper only has to do one thing: settle its hold exactly once, on every
 * way a body can end. A hold that never settles keeps the socket until the
 * isolate dies, which is the failure mode that would replace #684 rather than
 * fix it.
 *
 * The hold itself is observed through `withRequestScopedDb`, because that is
 * the only place a scope exists — outside one, holding is a no-op and the
 * process-wide client is nobody's to close.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	bindRequestScopedDb,
	holdRequestScopedDb,
	readScopedConnectionString,
	withRequestScopedDb
} from './index';
import { holdUntilResponseComplete } from './response-hold';

const encoder = new TextEncoder();

function streamed(body: string[]): Response {
	let index = 0;
	return new Response(
		new ReadableStream({
			pull(controller) {
				if (index >= body.length) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(body[index++]));
			}
		})
	);
}

describe('holdUntilResponseComplete', () => {
	it('passes a bodyless response straight through', () => {
		const response = new Response(null, { status: 304 });
		expect(holdUntilResponseComplete(response)).toBe(response);
	});

	it('keeps status and headers', async () => {
		const response = holdUntilResponseComplete(
			new Response(streamed(['hi']).body, {
				status: 201,
				headers: { 'content-type': 'text/plain', 'x-request-id': 'abc' }
			})
		);

		expect(response.status).toBe(201);
		expect(response.headers.get('x-request-id')).toBe('abc');
		await expect(response.text()).resolves.toBe('hi');
	});

	it('delivers the body unchanged', async () => {
		const response = holdUntilResponseComplete(streamed(['one ', 'two ', 'three']));
		await expect(response.text()).resolves.toBe('one two three');
	});

	it('surfaces an error from the source stream', async () => {
		const response = holdUntilResponseComplete(
			new Response(
				new ReadableStream({
					pull() {
						throw new Error('stream broke');
					}
				})
			)
		);

		await expect(response.text()).rejects.toThrow('stream broke');
	});

	it('cancels the source when the reader hangs up', async () => {
		const cancelled = vi.fn();
		const response = holdUntilResponseComplete(
			new Response(
				new ReadableStream({
					pull(controller) {
						controller.enqueue(encoder.encode('x'));
					},
					cancel: cancelled
				})
			)
		);

		await response.body!.cancel('client left');
		expect(cancelled).toHaveBeenCalledWith('client left');
	});
});

describe('holdRequestScopedDb', () => {
	it('is a no-op outside a request scope', () => {
		// A Node process has no per-request connection to hold open. This must not
		// throw — `scripts/` and the job worker call the same code paths.
		expect(() => holdRequestScopedDb(Promise.resolve())).not.toThrow();
	});

	it('does not delay a scope that never opened a connection', async () => {
		const defer = vi.fn();

		await withRequestScopedDb(async () => {
			holdRequestScopedDb(new Promise(() => {}));
		}, defer);

		// Nothing was opened, so there is nothing to close and nothing to wait
		// for. A hold must not conjure a close out of a request that never
		// queried. What the hold actually delays is asserted against a real
		// connection in `request-scope.integration.test.ts`.
		expect(defer).not.toHaveBeenCalled();
	});
});

/**
 * The other half of #684. A stream's producer is called by the runtime, not by
 * the promise chain the request started on, so `AsyncLocalStorage` does not
 * carry the scope into it. That is invisible in Node — `resolveDb` falls back
 * to the process-wide client and the query succeeds anyway — so the assertion
 * has to be about *which* scope the callback runs in, not about whether it
 * returns rows.
 */
describe('bindRequestScopedDb', () => {
	it('re-enters the request scope when called after the request returned', async () => {
		let bound: (() => string | undefined) | undefined;
		let unbound: (() => string | undefined) | undefined;

		await withRequestScopedDb(
			async () => {
				bound = bindRequestScopedDb(() => readScopedConnectionString());
				unbound = () => readScopedConnectionString();
			},
			vi.fn(),
			'postgres://hyperdrive.local/db'
		);

		// Outside the request now — the state a stream's producer is called in.
		expect(readScopedConnectionString()).toBeUndefined();
		expect(unbound!()).toBeUndefined();
		expect(bound!()).toBe('postgres://hyperdrive.local/db');
	});

	it('passes arguments and returns the value through', async () => {
		let bound: ((a: number, b: number) => number) | undefined;

		await withRequestScopedDb(async () => {
			bound = bindRequestScopedDb((a: number, b: number) => a + b);
		}, vi.fn());

		expect(bound!(2, 3)).toBe(5);
	});

	it('returns the function untouched outside a request scope', () => {
		// Node has no per-request scope to re-enter, and wrapping would only add a
		// frame to every tool call in `scripts/` and the job worker.
		const fn = () => 'plain';
		expect(bindRequestScopedDb(fn)).toBe(fn);
	});
});
