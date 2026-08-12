/**
 * Pure click-effect math for the non-silent goose.
 *
 * The component owns the markup, the sound, and the visual class; this module
 * owns the numbers so a unit test can assert "second click still fires confetti",
 * "reduced motion skips motion", and "reduced motion still gets a state change"
 * without mounting Svelte or waiting on CSS.
 */

export type GoosePokeInput = {
	/** Current FeatherConfetti counter. Must be a counter, not a boolean. */
	confettiTrigger: number;
	prefersReducedMotion: boolean;
};

export type GoosePokeResult = {
	/** Increments only when confetti may run — second honk re-fires the burst. */
	confettiTrigger: number;
	/** Full-motion shake. Never together with `flash`. */
	shake: boolean;
	/**
	 * Non-motion state change for reduced-motion users. Honk may already play;
	 * without this, muted + reduced-motion looks like a dead button.
	 */
	flash: boolean;
};

/**
 * What a non-silent goose does on click, aside from playing the honk.
 * Silent instances never call this.
 */
export function goosePokeEffects(input: GoosePokeInput): GoosePokeResult {
	if (input.prefersReducedMotion) {
		return {
			confettiTrigger: input.confettiTrigger,
			shake: false,
			flash: true
		};
	}
	return {
		confettiTrigger: input.confettiTrigger + 1,
		shake: true,
		flash: false
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
