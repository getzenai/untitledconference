/**
 * #62 cleanup: the starter "Zen AI / Enterprise" team switcher (no-op href)
 * must not reappear in the signed-in sidebar.
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
	it('does not render the starter team-switcher header', () => {
		// Starter labels that used to sit in Sidebar.Header.
		expect(source).not.toMatch(/Zen AI/);
		expect(source).not.toMatch(/>Enterprise</);
		expect(source).not.toContain('href="##"');
		expect(source).not.toContain('Sidebar.Header');
	});
});
