/**
 * svelte-sonner mounts a <section> landmark. Two Toasters on authenticated
 * pages were the landmark-unique hit on /settings/organization/<slug> (#440).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = readFileSync(join(here, '+layout.svelte'), 'utf8');
const protectedLayout = readFileSync(join(here, '(protected)/+layout.svelte'), 'utf8');

describe('toaster landmark', () => {
	it('mounts exactly one Toaster, on the root layout', () => {
		expect(root).toContain('<Toaster richColors closeButton />');
		expect(protectedLayout).not.toContain('<Toaster');
		expect(protectedLayout).not.toContain('$lib/components/ui/sonner');
	});
});
