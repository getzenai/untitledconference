/**
 * #869: the star's size and inset are tokens, not a measured 44 / 0.
 * /home starts after the same two numbers. A hardcoded pl-8 would
 * pass today's geometry and miss tomorrow's.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const launcher = readFileSync(join(here, 'assistant-launcher.svelte'), 'utf8');
const css = readFileSync(join(here, '../../../app.css'), 'utf8');

describe('assistant star column', () => {
	it('defines size and inset once, and the launcher uses both', () => {
		expect(css).toContain('--assistant-star-size:');
		expect(css).toContain('--assistant-star-inset:');
		expect(css).toContain(
			'padding-left: calc(var(--assistant-star-inset) + var(--assistant-star-size))'
		);
		expect(launcher).toContain('size-(--assistant-star-size)');
		expect(launcher).toContain('left-(--assistant-star-inset)');
		expect(launcher).not.toContain('size-11');
		expect(launcher).not.toMatch(/['"]left-0 /);
	});
});
