<script lang="ts">
	/**
	 * Inline copy of static/mascot/goose.svg with a solid body fill. An <img>
	 * reference can't take part in the page's color scheme (no currentColor,
	 * no CSS vars, no dark: variants reach into an external SVG document) —
	 * inlining is what lets light/dark just be two shades instead of a
	 * filter:invert() hack.
	 */
	import { playRandomHonk } from '$lib/goose-honk';
	import { cn } from '$lib/utils.js';

	let {
		class: className = '',
		silent = false,
		alt = ''
	}: { class?: string; silent?: boolean; alt?: string } = $props();
</script>

{#snippet paths()}
	<path
		d="M50 4C60 4 66 11 66 21 66 28 63 32 62 37 61 41 61 45 60 49 77 54 90 67 90 85 90 94 86 100 79 104 71 108 61 110 50 110 28 110 10 102 10 85 10 67 23 54 40 49 39 45 39 41 38 37 37 32 34 28 34 21 34 11 40 4 50 4Z"
		class="fill-gray-200 dark:fill-gray-600"
	/>
	<path d="M76 66C75 80 70 90 61 96" stroke-width="1.5" />
	<path
		d="M41 110 39 117M39 117 28 122Q39 124 50 122Z"
		class="fill-orange-700 dark:fill-orange-900"
	/>
	<path
		d="M59 110 61 117M61 117 50 122Q61 124 72 122Z"
		class="fill-orange-700 dark:fill-orange-900"
	/>
	<circle cx="43.5" cy="16" r="1.8" fill="currentColor" stroke="none" />
	<circle cx="56.5" cy="16" r="1.8" fill="currentColor" stroke="none" />
	<path
		d="M37 23Q50 18 63 23Q50 33 37 23Z"
		class="fill-orange-700 dark:fill-orange-900"
		stroke-width="1.5"
	/>
{/snippet}

{#if silent}
	<svg
		viewBox="0 0 100 125"
		class={cn('text-gray-500 dark:text-gray-400', className)}
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
		onclick={playRandomHonk}
		aria-label={alt || 'Honk'}
		class="focus-visible:ring-ring appearance-none border-0 bg-transparent p-0 leading-none focus-visible:ring-[3px] focus-visible:outline-none"
	>
		<svg
			viewBox="0 0 100 125"
			class={cn('cursor-pointer text-gray-500 dark:text-gray-400', className)}
			stroke="currentColor"
			stroke-width="2.3"
			stroke-linejoin="round"
			stroke-linecap="round"
			aria-hidden="true"
		>
			{@render paths()}
		</svg>
	</button>
{/if}
