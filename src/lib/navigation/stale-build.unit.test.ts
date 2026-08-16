import { describe, expect, it, vi } from 'vitest';
import { reloadIfBuildIsStale } from './stale-build';

const navigationTo = (href: string) => ({ willUnload: false, to: { url: new URL(href) } });

describe('reloadIfBuildIsStale', () => {
	it('turns the next navigation into a full page load once the build is gone', () => {
		const load = vi.fn();

		const reloaded = reloadIfBuildIsStale(
			navigationTo('https://example.com/dashboard'),
			true,
			load
		);

		expect(reloaded).toBe(true);
		expect(load).toHaveBeenCalledWith(new URL('https://example.com/dashboard'));
	});

	it('leaves navigation to SvelteKit while the build is current', () => {
		const load = vi.fn();

		const reloaded = reloadIfBuildIsStale(
			navigationTo('https://example.com/dashboard'),
			false,
			load
		);

		expect(reloaded).toBe(false);
		expect(load).not.toHaveBeenCalled();
	});

	it('does not interfere with a navigation that already unloads the page', () => {
		const load = vi.fn();

		const reloaded = reloadIfBuildIsStale(
			{ willUnload: true, to: { url: new URL('https://elsewhere.example/') } },
			true,
			load
		);

		expect(reloaded).toBe(false);
		expect(load).not.toHaveBeenCalled();
	});

	it('has nothing to load when the navigation has no target', () => {
		const load = vi.fn();

		const reloaded = reloadIfBuildIsStale({ willUnload: false, to: null }, true, load);

		expect(reloaded).toBe(false);
		expect(load).not.toHaveBeenCalled();
	});
});
