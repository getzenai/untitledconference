import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import UnsavedGuard from './unsaved-guard.svelte';

/**
 * The guard is a lifecycle hook wearing a component, and the thing that could
 * go wrong on the way in is the server: a page rendered on the server runs the
 * component's script too. If `beforeNavigate` were not server-safe, every
 * creation form would stop rendering at all — a far worse failure than the one
 * the guard is there to prevent. The decision itself is tested next door, in
 * `unsaved-work.unit.test.ts`.
 */
describe('the unsaved-work guard', () => {
	it('renders nothing and survives the server', () => {
		// Svelte's own hydration markers are all that comes back; no element does.
		expect(render(UnsavedGuard, { props: { dirty: true } }).body).not.toMatch(/<[a-z]/);
	});
});
