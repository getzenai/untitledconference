/** A post-mount empty choice must go through and drop the key (#801). */
import { describe, expect, it } from 'vitest';
import { browserDraftKey } from './browser-draft';
import { chooseBrowserDraftSelect } from './browser-draft-select';

function fakeStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		}
	};
}

describe('chooseBrowserDraftSelect', () => {
	const scope = 'cfp-autosave:devflow:sessionFormatId';
	const owner = 'anonymous';
	const key = browserDraftKey(scope, owner);

	it('swallows the empty mount fire so a restored pick stays parked', () => {
		const storage = fakeStorage();
		chooseBrowserDraftSelect(storage, {
			mounted: true,
			next: '1',
			value: '',
			baseline: '',
			scope,
			owner
		});
		const parked = storage.getItem(key);
		expect(parked).not.toBeNull();

		const swallowed = chooseBrowserDraftSelect(storage, {
			mounted: false,
			next: '',
			value: '1',
			baseline: '',
			scope,
			owner
		});
		expect(swallowed).toEqual({ accepted: false, value: '1' });
		expect(storage.getItem(key)).toBe(parked);
	});

	it('lets a post-mount empty choice through and clears the parked key', () => {
		const storage = fakeStorage();

		const picked = chooseBrowserDraftSelect(storage, {
			mounted: true,
			next: '1',
			value: '',
			baseline: '',
			scope,
			owner
		});
		expect(picked).toEqual({ accepted: true, value: '1' });
		expect(storage.getItem(key)).not.toBeNull();

		const cleared = chooseBrowserDraftSelect(storage, {
			mounted: true,
			next: '',
			value: picked.value,
			baseline: '',
			scope,
			owner
		});
		expect(cleared).toEqual({ accepted: true, value: '' });
		expect(storage.getItem(key)).toBeNull();
	});
});
