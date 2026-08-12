import { describe, expect, it } from 'vitest';
import { goosePokeEffects, prefersReducedMotion } from './goose-poke';

describe('goosePokeEffects', () => {
	it('increments the confetti counter so a second click re-fires the burst', () => {
		const first = goosePokeEffects({ confettiTrigger: 0, prefersReducedMotion: false });
		const second = goosePokeEffects({
			confettiTrigger: first.confettiTrigger,
			prefersReducedMotion: false
		});

		expect(first.confettiTrigger).toBe(1);
		expect(second.confettiTrigger).toBe(2);
		expect(first.shake).toBe(true);
		expect(first.flash).toBe(false);
		expect(second.shake).toBe(true);
	});

	it('under reduced motion: no confetti bump, no shake, but a flash', () => {
		const result = goosePokeEffects({ confettiTrigger: 4, prefersReducedMotion: true });

		// Confetti is motion; leave the counter alone. FeatherConfetti also self-gates.
		expect(result.confettiTrigger).toBe(4);
		expect(result.shake).toBe(false);
		// Reduced motion forbids movement, not state change — a dim/bright is enough.
		expect(result.flash).toBe(true);
	});
});

describe('prefersReducedMotion', () => {
	it('is false when matchMedia is unavailable (SSR)', () => {
		expect(prefersReducedMotion(undefined)).toBe(false);
	});

	it('reads the reduce media query', () => {
		expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
		expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
	});
});
