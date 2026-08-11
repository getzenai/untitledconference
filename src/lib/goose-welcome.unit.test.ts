import { describe, expect, it } from 'vitest';
import { consumeGooseWelcome, markGooseWelcome } from './goose-welcome';

function fakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		}
	};
}

describe('goose welcome flag', () => {
	it('is consumed exactly once after being marked', () => {
		const storage = fakeStorage();

		markGooseWelcome(storage);

		expect(consumeGooseWelcome(storage)).toBe(true);
		expect(consumeGooseWelcome(storage)).toBe(false);
	});

	it('is false when nothing was marked', () => {
		expect(consumeGooseWelcome(fakeStorage())).toBe(false);
	});

	it('ignores unrelated storage contents', () => {
		const storage = fakeStorage({ 'goose-welcome-back': '0', unrelated: '1' });

		expect(consumeGooseWelcome(storage)).toBe(false);
	});
});
