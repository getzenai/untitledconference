<script lang="ts">
	/**
	 * A wide table on a narrow screen, with the sideways scroll made visible.
	 *
	 * Two things go wrong without this. `overflow-hidden` on a bordered table box —
	 * which is what these screens had, purely to keep the corners rounded — clips the
	 * right-hand columns off a phone with no way to reach them at all: the submissions
	 * table has nine columns, and "Status" and "Notification" are the two an organizer
	 * came for. And `overflow-x-auto` alone fixes the reachability without telling
	 * anyone: a table cut off flush at the edge of a card reads as a table that ends
	 * there.
	 *
	 * So: the scroll lives on an inner element and the rounding stays on the outer one,
	 * and a hint appears — only while the content really is wider than the box, watched
	 * with a ResizeObserver rather than guessed from a breakpoint. Guessing gets it
	 * wrong in both directions: five columns fit on a phone, and nine do not fit in a
	 * narrow desktop window either.
	 */
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	let {
		children,
		label = 'Scroll sideways for the rest of the columns',
		class: className,
		...rest
	}: {
		children: Snippet;
		/** What the hint says. Name the columns when the screen has a better word. */
		label?: string;
		class?: string;
		[key: string]: unknown;
	} = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let overflowing = $state(false);

	$effect(() => {
		const element = viewport;
		if (!element) return;

		// A pixel of slack: sub-pixel layout rounding makes scrollWidth exceed
		// clientWidth by fractions on tables that fit perfectly well, and a hint that
		// points at nothing is worse than no hint.
		const measure = () => {
			overflowing = element.scrollWidth - element.clientWidth > 1;
		};

		// Both the box and its content: the box changes when the window does, the
		// content changes when a filter swaps a short title for a long one. Watching
		// only the box misses the second, which is the one that happens while somebody
		// is looking at the screen.
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		measure();

		return () => observer.disconnect();
	});
</script>

{#if overflowing}
	<p class="text-muted-foreground mb-1.5 text-xs" data-testid="scroll-hint" role="status">
		{label} <span aria-hidden="true">→</span>
	</p>
{/if}

<div class={cn('border-border overflow-hidden rounded-lg border', className)} {...rest}>
	<div bind:this={viewport} class="overflow-x-auto">
		{@render children()}
	</div>
</div>
