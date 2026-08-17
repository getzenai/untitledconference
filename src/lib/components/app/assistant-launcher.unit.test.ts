/**
 * #869 / #875: the star's size and inset are tokens, not a measured
 * 44 / 0. The reserved column fires where the star is rendered, so a
 * new page inherits it. A hardcoded pl-8 would pass today's geometry
 * and miss tomorrow's.
 *
 * #889: above md the star docks right. Only pages that opt in with
 * `data-before-star` pad that edge — a column on every organizer
 * page was #886.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const launcher = readFileSync(join(here, 'assistant-launcher.svelte'), 'utf8');
const css = readFileSync(join(here, '../../../app.css'), 'utf8');
const shell = readFileSync(
	join(here, '../../../routes/(protected)/(with-sidebar)/+layout.svelte'),
	'utf8'
);
const conferenceShell = readFileSync(
	join(here, '../../../routes/(protected)/manage/[slug]/+layout.svelte'),
	'utf8'
);
const agenda = readFileSync(
	join(here, '../../../routes/(protected)/manage/[slug]/agenda/+page.svelte'),
	'utf8'
);

describe('assistant star column', () => {
	it('defines size and inset once, and the launcher uses both', () => {
		expect(css).toContain('--assistant-star-size:');
		expect(css).toContain('--assistant-star-inset:');
		expect(css).toContain(':has([data-assistant-star])');
		expect(css).toContain('[data-after-star]');
		expect(css).toContain(
			'padding-left: calc(var(--assistant-star-inset) + var(--assistant-star-size))'
		);
		expect(css).not.toContain('.home-after-star');
		expect(launcher).toContain('data-assistant-star');
		expect(launcher).toContain('size-(--assistant-star-size)');
		expect(launcher).toContain('left-(--assistant-star-inset)');
		expect(launcher).not.toContain('size-11');
		expect(launcher).not.toMatch(/['"]left-0 /);
		expect(shell).toContain('data-after-star');
	});

	it('pads the right only where a page opts in, and only above md (#889)', () => {
		expect(css).toContain('[data-before-star]');
		expect(css).toContain(
			'padding-right: calc(var(--assistant-star-inset) + var(--assistant-star-size))'
		);
		expect(css).toMatch(/@media \(width >= 48rem\) \{[^}]*\[data-before-star\][^}]*padding-right/);
		expect(agenda).toContain('data-before-star');
		expect(agenda).not.toContain('data-after-star');
		expect(conferenceShell).not.toContain('data-after-star');
		expect(conferenceShell).not.toContain('data-before-star');
	});
});
