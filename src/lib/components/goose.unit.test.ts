/**
 * Contract test for the goose easter egg wiring.
 *
 * Behaviour of the counter/shake math lives in `goose-poke.unit.test.ts`.
 * This file locks the component choices the issue called out: FeatherConfetti
 * (counter, not a local reimplementation), no transform on the button, silent
 * stays silent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'goose.svelte'), 'utf8');

describe('goose.svelte easter egg wiring', () => {
	it('reuses FeatherConfetti with a counter, not a boolean', () => {
		expect(source).toContain("from '$lib/components/feather-confetti.svelte'");
		expect(source).toContain('<FeatherConfetti');
		expect(source).toMatch(/confettiTrigger/);
		// Boolean prop would not re-fire on a second click.
		expect(source).not.toMatch(/trigger=\{true\}|trigger=\{false\}|trigger=\{!!/);
	});

	it('puts shake transform on an inner element, never on the button', () => {
		// The focus ring lives on the button; a transform there would slide it.
		const buttonMatch = source.match(/<button[\s\S]*?>/);
		expect(buttonMatch).toBeTruthy();
		expect(buttonMatch![0]).not.toMatch(/goose-shake|transform/);

		expect(source).toContain('goose-shake');
		expect(source).toMatch(/class=\{[^}]*goose-shake/);
	});

	it('gates the shake on reduced motion; silent has no poke handler', () => {
		expect(source).toContain('prefersReducedMotion');
		expect(source).toContain('goosePokeEffects');
		// Reduced-motion path still has a non-motion state change (opacity flash).
		expect(source).toContain('goose-flash');

		// Silent branch is a bare svg — no button, no FeatherConfetti inside it.
		const silentBlock = source.slice(source.indexOf('{#if silent}'), source.indexOf('{:else}'));
		expect(silentBlock).toContain('<svg');
		expect(silentBlock).not.toContain('onclick');
		expect(silentBlock).not.toContain('FeatherConfetti');
		expect(silentBlock).not.toContain('goosePokeEffects');
	});
});
