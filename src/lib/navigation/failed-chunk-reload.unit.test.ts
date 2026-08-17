import { describe, expect, it } from 'vitest';
import {
	clearFailedChunkReloadMarker,
	clearMarkerOnceHydrated,
	FAILED_CHUNK_RELOAD_MARKER,
	isFailedDynamicImport,
	shouldReloadFailedChunkOnce
} from './failed-chunk-reload';

function memoryStorage(initial: Record<string, string> = {}) {
	const data = { ...initial };
	return {
		getItem: (key: string) => data[key] ?? null,
		setItem: (key: string, value: string) => {
			data[key] = value;
		},
		removeItem: (key: string) => {
			delete data[key];
		},
		data
	};
}

const missingChunk = new TypeError(
	'Failed to fetch dynamically imported module: https://untitledconference.com/_app/immutable/nodes/1.qn-4W9UA.js'
);

describe('shouldReloadFailedChunkOnce', () => {
	it('reloads the first failed dynamic import and refuses the second pass', () => {
		const storage = memoryStorage();

		expect(shouldReloadFailedChunkOnce(missingChunk, storage)).toBe(true);
		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBe('1');
		expect(shouldReloadFailedChunkOnce(missingChunk, storage)).toBe(false);
	});

	it('leaves every other error on the error page', () => {
		const storage = memoryStorage();

		expect(shouldReloadFailedChunkOnce(new TypeError('undefined is not a function'), storage)).toBe(
			false
		);
		expect(shouldReloadFailedChunkOnce(new Error('Internal Error'), storage)).toBe(false);
		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBeNull();
	});

	it('does not reload when there is no storage to remember the first try', () => {
		expect(shouldReloadFailedChunkOnce(missingChunk, null)).toBe(false);
	});

	it('can reload again after a successful load cleared the marker', () => {
		const storage = memoryStorage();

		expect(shouldReloadFailedChunkOnce(missingChunk, storage)).toBe(true);
		clearFailedChunkReloadMarker(storage);
		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBeNull();
		expect(shouldReloadFailedChunkOnce(missingChunk, storage)).toBe(true);
	});
});

describe('isFailedDynamicImport', () => {
	it('recognises the browser strings, not a wrapped Internal Error', () => {
		expect(isFailedDynamicImport(missingChunk)).toBe(true);
		expect(isFailedDynamicImport(new TypeError('Importing a module script failed.'))).toBe(true);
		expect(isFailedDynamicImport(new TypeError('error loading dynamically imported module'))).toBe(
			true
		);
		expect(isFailedDynamicImport({ message: 'Internal Error' })).toBe(false);
	});
});

describe('clearMarkerOnceHydrated', () => {
	it('clears only after the layout has marked the body hydrated', () => {
		const storage = memoryStorage({ [FAILED_CHUNK_RELOAD_MARKER]: '1' });
		const target = { dataset: {} as DOMStringMap };
		let notify: (() => void) | undefined;
		const stop = clearMarkerOnceHydrated(storage, target, (onChange) => {
			notify = onChange;
			return () => {
				notify = undefined;
			};
		});

		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBe('1');
		notify?.();
		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBe('1');

		target.dataset.hydrated = 'true';
		notify?.();
		expect(storage.getItem(FAILED_CHUNK_RELOAD_MARKER)).toBeNull();
		stop();
	});
});
