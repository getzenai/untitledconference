/**
 * Pure click-effect math for the non-silent goose.
 *
 * The component owns the markup, the sound, and the animation class; this module
 * owns the numbers so a unit test can assert "second click still fires confetti"
 * and "reduced motion skips the shake" without mounting Svelte or waiting on CSS.
 */

export type GoosePokeInput = {
	/** Current FeatherConfetti counter. Must be a counter, not a boolean. */
	confettiTrigger: number;
	prefersReducedMotion: boolean;
};

export type GoosePokeResult = {
	/** Always increments so a second honk re-fires the burst. */
	confettiTrigger: number;
	/** Whether to run the shake class. Honk is decided by the caller (always). */
	shake: boolean;
};

/**
 * What a non-silent goose does on click, aside from playing the honk.
 * Silent instances never call this.
 */
export function goosePokeEffects(input: GoosePokeInput): GoosePokeResult {
	return {
		confettiTrigger: input.confettiTrigger + 1,
		shake: !input.prefersReducedMotion
	};
}

/** SSR-safe reduced-motion probe. Sound is not gated — only motion is. */
export function prefersReducedMotion(
	matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window !== 'undefined'
		? window.matchMedia.bind(window)
		: undefined
): boolean {
	if (!matchMedia) return false;
	return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
