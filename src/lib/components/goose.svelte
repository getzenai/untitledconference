<script lang="ts">
	/**
	 * Inline goose with solid body. Light: white plumage, orange bill, black
	 * outline/eyes. Dark: only white and orange darken — no invert, no hue flip.
	 *
	 * Non-silent: click honks, drops feathers (FeatherConfetti counter), and
	 * shakes briefly. Silent: decorative only — no button, no motion, no sound.
	 */
	import FeatherConfetti from '$lib/components/feather-confetti.svelte';
	import { playRandomHonk } from '$lib/goose-honk';
	import { goosePokeEffects, prefersReducedMotion } from '$lib/goose-poke';
	import { cn } from '$lib/utils.js';

	let {
		class: className = '',
		silent = false,
		alt = ''
	}: { class?: string; silent?: boolean; alt?: string } = $props();

	/** Counter, not boolean — bumping re-fires FeatherConfetti on every click. */
	let confettiTrigger = $state(0);
	let shaking = $state(false);

	function poke() {
		playRandomHonk();
		const next = goosePokeEffects({
			confettiTrigger,
			prefersReducedMotion: prefersReducedMotion()
		});
		confettiTrigger = next.confettiTrigger;
		if (!next.shake) {
			shaking = false;
			return;
		}
		// Drop the class first so a rapid re-click restarts the keyframes.
		shaking = false;
		requestAnimationFrame(() => {
			shaking = true;
		});
	}

	function onShakeEnd() {
		shaking = false;
	}
</script>

{#snippet paths()}
	<path
		d="M50 4C60 4 66 11 66 21 66 28 63 32 62 37 61 41 61 45 60 49 77 54 90 67 90 85 90 94 86 100 79 104 71 108 61 110 50 110 28 110 10 102 10 85 10 67 23 54 40 49 39 45 39 41 38 37 37 32 34 28 34 21 34 11 40 4 50 4Z"
		class="fill-white dark:fill-neutral-300"
	/>
	<path d="M76 66C75 80 70 90 61 96" stroke-width="1.5" />
	<path
		d="M41 110 39 117M39 117 28 122Q39 124 50 122Z"
		class="fill-orange-500 dark:fill-orange-700"
	/>
	<path
		d="M59 110 61 117M61 117 50 122Q61 124 72 122Z"
		class="fill-orange-500 dark:fill-orange-700"
	/>
	<circle cx="43.5" cy="16" r="1.8" class="fill-black dark:fill-neutral-950" stroke="none" />
	<circle cx="56.5" cy="16" r="1.8" class="fill-black dark:fill-neutral-950" stroke="none" />
	<path
		d="M37 23Q50 18 63 23Q50 33 37 23Z"
		class="fill-orange-500 dark:fill-orange-700"
		stroke-width="1.5"
	/>
{/snippet}

{#if silent}
	<svg
		viewBox="0 0 100 125"
		class={cn('text-black dark:text-neutral-950', className)}
		stroke="currentColor"
		stroke-width="2.3"
		stroke-linejoin="round"
		stroke-linecap="round"
		role="img"
		aria-label={alt || undefined}
		aria-hidden={alt ? undefined : 'true'}
	>
		{@render paths()}
	</svg>
{:else}
	<button
		type="button"
		onclick={poke}
		aria-label={alt || 'Honk'}
		class="focus-visible:ring-ring appearance-none border-0 bg-transparent p-0 leading-none focus-visible:ring-[3px] focus-visible:outline-none"
	>
		<!--
			Shake lives on the SVG, never the button: a transform on the button
			would walk the focus ring. FeatherConfetti is fixed + pointer-events
			none, so the burst never shifts layout around the goose.
		-->
		<svg
			viewBox="0 0 100 125"
			class={cn(
				'cursor-pointer text-black dark:text-neutral-950',
				className,
				shaking && 'goose-shake'
			)}
			stroke="currentColor"
			stroke-width="2.3"
			stroke-linejoin="round"
			stroke-linecap="round"
			aria-hidden="true"
			onanimationend={onShakeEnd}
		>
			{@render paths()}
		</svg>
	</button>
	<FeatherConfetti trigger={confettiTrigger} />
{/if}

<style>
	.goose-shake {
		animation: goose-shake 450ms ease-in-out;
	}

	@keyframes goose-shake {
		0%,
		100% {
			transform: rotate(0deg);
		}
		20% {
			transform: rotate(-8deg);
		}
		40% {
			transform: rotate(8deg);
		}
		60% {
			transform: rotate(-5deg);
		}
		80% {
			transform: rotate(5deg);
		}
	}

	/* Belt-and-braces if the media query flips mid-animation. */
	@media (prefers-reduced-motion: reduce) {
		.goose-shake {
			animation: none;
		}
	}
</style>
