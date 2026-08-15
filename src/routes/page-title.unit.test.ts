/**
 * Every page names itself in the browser tab.
 *
 * `app.html` sets no `<title>` and no layout sets one either, so a route that
 * forgets its own `<svelte:head>` ships nameless: the tab, the history entry and
 * the bookmark are blank, and a screen reader announces nothing on navigation.
 * axe calls that `document-title`, impact serious. Five routes had shipped that
 * way — the organization settings pages, the invitation pages (#437).
 *
 * A layout-level default cannot fix this: two `<title>` elements in one document
 * are not a fallback, the first one wins, and the layout renders first. So the
 * rule is enforced where it is broken — in the route file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROUTES = fileURLToPath(new URL('.', import.meta.url));

/**
 * Components that carry the `<svelte:head><title>` for the page that uses them.
 * A page may delegate, but only to something that actually sets a title — keep
 * this list honest, an entry here silences the check for every page using it.
 */
const TITLE_PROVIDERS = ['<AuthShell'];

function pageFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return pageFiles(path);
		return entry.name === '+page.svelte' ? [path] : [];
	});
}

describe('every page has a title', () => {
	it('sets one itself or delegates to a component that does', () => {
		const nameless = pageFiles(ROUTES)
			.filter((file) => {
				const source = readFileSync(file, 'utf8');
				if (/<svelte:head>[\s\S]*?<title>/.test(source)) return false;
				return !TITLE_PROVIDERS.some((provider) => source.includes(provider));
			})
			.map((file) => file.replace(ROUTES, 'src/routes/'));

		// If this fails: add `<svelte:head><title>…</title></svelte:head>` to the page.
		expect(nameless).toEqual([]);
	});
});
