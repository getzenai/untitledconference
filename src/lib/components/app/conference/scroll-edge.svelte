<script lang="ts">
	/**
	 * A strip wider than the screen, with the "there is more to the right" said out
	 * loud (#393).
	 *
	 * `overflow-x-auto` makes the rest reachable and tells nobody it is there. On a
	 * phone that is not a small problem: the public agenda's room grid ends flush at
	 * the right edge of a 390 px screen, so a four-room conference reads as a
	 * two-room conference — the visitor does not think "I should swipe", they think
	 * "there are two talks at 11:00". iOS only draws a scrollbar once you are already
	 * scrolling, which is exactly too late.
	 *
	 * So a fading edge, and only while it is true: it appears when the content really
	 * is wider than the box, and goes away at the right-hand end of the scroll. A
	 * permanent shadow would be the same lie pointing the other way — it would claim
	 * there is more on a conference with two rooms on a desktop.
	 *
	 * Measured, never guessed from a breakpoint: whether a strip fits depends on how
	 * many rooms and how long their names are, which no breakpoint knows. A
	 * ResizeObserver watches the box and its content; `scroll` handles the rest.
	 *
	 * Not `scroll-table.svelte`, which solves the neighbouring problem for organizer
	 * tables: that one puts a sentence above a bordered card ("Scroll sideways for
	 * the rest of the columns"), which is right for a table in a card and wrong for
	 * a tab strip in the site header, where there is no card and no room for a line
	 * of prose.
	 */
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	let {
		children,
		class: className,
		viewportClass,
		...rest
	}: {
		children: Snippet;
		/** Classes for the outer, positioned box — width, margins, alignment. */
		class?: string;
		/** Classes for the element that actually scrolls. */
		viewportClass?: string;
		[key: string]: unknown;
	} = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let more = $state(false);

	// A pixel of slack in both terms: sub-pixel layout rounding puts scrollWidth a
	// fraction above clientWidth on strips that fit perfectly well, and a browser
	// scrolled to the end lands a fraction short of the arithmetic end.
	const measure = () => {
		const element = viewport;
		if (!element) return;
		more = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
	};

	$effect(() => {
		const element = viewport;
		if (!element) return;

		// The box changes when the window does; the content changes when a day with
		// four rooms replaces one with two. Watching only the box misses the second,
		// which is the one that happens while somebody is looking at the screen.
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		measure();

		return () => observer.disconnect();
	});
</script>

<div class={cn('relative', className)} {...rest}>
	<div bind:this={viewport} onscroll={measure} class={cn('overflow-x-auto', viewportClass)}>
		{@render children()}
	</div>

	{#if more}
		<!-- Decoration, and it has to stay decoration: a visitor who taps where the
		     gradient lies must reach the tab underneath it, and a screenreader must
		     not hear about a shadow. -->
		<div
			aria-hidden="true"
			data-testid="scroll-edge"
			class="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent"
		></div>
	{/if}
</div>
