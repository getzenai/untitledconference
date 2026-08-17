import { FAILED_CHUNK_RELOAD_MARKER } from '$lib/navigation/failed-chunk-reload';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './hooks.client.js';

vi.mock('$lib/analytics/posthog', () => ({
	captureClientException: vi.fn()
}));

const missingChunk = new TypeError(
	'Failed to fetch dynamically imported module: https://untitledconference.com/_app/immutable/nodes/1.qn-4W9UA.js'
);

const call = (error: unknown) =>
	handleError({
		error,
		status: 500,
		message: 'Internal Error',
		event: { url: new URL('https://untitledconference.com/c/devflow/cfp') }
		// The rest of the SvelteKit event is not read by this handler.
	} as unknown as Parameters<typeof handleError>[0]);

const reload = vi.fn();

beforeEach(() => {
	reload.mockClear();
	vi.stubGlobal('location', { reload });
});

describe('handleError and a storage that refuses to write (#896)', () => {
	it('does not reload, and does not throw, when setItem throws', () => {
		// Reading the global works; the write is what fails. That is the shape a
		// full quota or a locked store actually has — guarding only the read
		// leaves the throw inside the error handler.
		vi.stubGlobal('sessionStorage', {
			getItem: () => null,
			setItem: () => {
				throw new DOMException('QuotaExceededError');
			},
			removeItem: () => {}
		});

		expect(() => call(missingChunk)).not.toThrow();
		expect(reload).not.toHaveBeenCalled();
	});

	it('still reloads once when the store works — the control', () => {
		const data = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => void data.set(key, value),
			removeItem: (key: string) => void data.delete(key)
		});

		call(missingChunk);

		expect(reload).toHaveBeenCalledTimes(1);
		expect(data.get(FAILED_CHUNK_RELOAD_MARKER)).toBe('1');
	});

	it('leaves an ordinary error alone even when the store works', () => {
		vi.stubGlobal('sessionStorage', {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {}
		});

		call(new TypeError('undefined is not a function'));

		expect(reload).not.toHaveBeenCalled();
	});
});
