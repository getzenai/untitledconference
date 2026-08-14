/**
 * #62 removed the starter team switcher. The product wordmark may occupy the
 * same region, but unlike that old no-op it must be a real route home.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'app-sidebar.svelte'),
	'utf8'
);

describe('app sidebar starter cleanup', () => {
	it('renders a product home link instead of the starter team switcher', () => {
		// Starter labels that used to sit in Sidebar.Header.
		expect(source).not.toMatch(/Zen AI/);
		expect(source).not.toMatch(/>Enterprise</);
		expect(source).not.toContain('href="##"');
		expect(source).toContain('Sidebar.Header');
		expect(source).toContain('data-testid="sidebar-home-link"');
		expect(source).toContain('href="/home"');
		expect(source).toContain('untitledconference');
	});

	it('is icon-collapsible and pins the account menu in the footer (#410)', () => {
		expect(source).toContain("collapsible = 'icon'");
		expect(source).toContain('Sidebar.Footer');
		expect(source).toContain('NavUser');
		// Conference destinations ride along in the mobile sheet; desktop has
		// ConferenceSidebar. One list (`NavConference`), not a second <aside>.
		expect(source).toContain('NavConference');
		expect(source).toContain('isConferencePath(page.url.pathname)');
		expect(source).not.toMatch(/<aside[\s>]/);
	});

	it('takes the reviewing item from reviewSlug, not a hard-coded /review (#373)', () => {
		// The module-level list still says /review (the list of many). The
		// derived items overwrite that when navAccess names exactly one
		// conference, so the common reviewer never hits the 303.
		expect(source).toContain('reviewQueueHref(navAccess.reviewSlug)');
	});
});
