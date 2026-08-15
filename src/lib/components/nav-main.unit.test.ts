/**
 * Contacts children are markup on the existing shadcn MenuSub (#420).
 * Active-state arithmetic lives in `nav-access.ts` so this file only
 * pins the wiring: the parent opens, the matching child is marked.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'nav-main.svelte'),
	'utf8'
);

describe('platform nav sub-items (#420)', () => {
	it('renders children on Sidebar.MenuSub and marks the matching one', () => {
		expect(source).toContain('Sidebar.MenuSub');
		expect(source).toContain('Sidebar.MenuSubButton');
		expect(source).toContain('isNavUrlCurrent');
		expect(source).toContain('isActive={childIsCurrent(mainItem, subItem.url)}');
		expect(source).toContain("data-state={open ? 'open' : undefined}");
	});

	it('withholds the children when the parent is locked', () => {
		expect(source).toContain('lock ? [] : (mainItem.items ?? [])');
	});
});
