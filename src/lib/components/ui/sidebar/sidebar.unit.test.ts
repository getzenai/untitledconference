/**
 * #440: the sidebar shell is a named landmark so its header, groups and
 * triggers are not skipped by region navigation. App and conference rails
 * pass distinct names; the primitive itself is the aside — callers do not
 * hand-write a second one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const primitive = readFileSync(join(here, 'sidebar.svelte'), 'utf8');
const appSidebar = readFileSync(join(here, '../../app-sidebar.svelte'), 'utf8');
const conferenceSidebar = readFileSync(join(here, '../../conference-sidebar.svelte'), 'utf8');

describe('sidebar landmark', () => {
	it('is an aside with a default accessible name', () => {
		expect(primitive).toMatch(/<aside/);
		expect(primitive).toContain('"aria-label": ariaLabel = "Sidebar"');
		expect(primitive).toContain('aria-label={ariaLabel}');
	});

	it('gives the app rail and the conference rail different names', () => {
		expect(appSidebar).toContain('aria-label="Application"');
		expect(conferenceSidebar).toContain('aria-label="Event"');
		expect(appSidebar).not.toContain('aria-label="Event"');
		expect(conferenceSidebar).not.toContain('aria-label="Application"');
	});
});
