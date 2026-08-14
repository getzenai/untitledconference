import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'conference-sidebar.svelte'),
	'utf8'
);

describe('conference sidebar', () => {
	it('is a shadcn Sidebar.Root, not a second handwritten aside', () => {
		expect(source).toContain('Sidebar.Root');
		expect(source).toContain('collapsible="none"');
		expect(source).toContain('min-h-svh');
		expect(source).toContain('data-testid="conference-sidebar"');
		expect(source).toContain('NavConference');
		expect(source).toContain('data-testid="switch-conference"');
		expect(source).toContain('aria-label="Conference"');
		expect(source).not.toMatch(/<aside[\s>]/);
		expect(source).not.toContain('AccountMenu');
		expect(source).not.toContain('NavUser');
	});
});
