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
});
