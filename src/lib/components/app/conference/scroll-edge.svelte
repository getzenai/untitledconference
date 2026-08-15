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
	 * An optional sentence sits above the strip and names what is missing. The fade
	 * is easy to miss in a bright hall; "Scroll sideways for the other rooms" is
	 * not (#403). The sentence tracks whether the content is wider than the box,
	 * not how far the visitor has already scrolled — rooms that do not fit stay
	 * named after the last column is on screen. Leave `label` unset on a tab strip:
	 * there is no card and no room for a line of prose.
	 *
	 * Measured, never guessed from a breakpoint: whether a strip fits depends on how
	 * many rooms and how long their names are, which no breakpoint knows. A
	 * ResizeObserver watches the box and its content; `scroll` handles the rest.
	 *
	 * Not `scroll-table.svelte`, which solves the neighbouring problem for organizer
	 * tables: that one puts the same kind of sentence above a bordered card. The
	 * public agenda is borderless, so the sentence lives here and the box stays off.
	 *
	 * The fade says *that* there is more and leaves the *how* to the input device
	 * (#589). A trackpad has a two-finger swipe; a wheel mouse needs `Shift`+wheel,
	 * which nobody knows. On an eight-room grid that put half the programme out of
	 * reach, so each edge that has something behind it also carries a button. They
	 * are real buttons, so a keyboard and a screenreader get the same reach as a
	 * trackpad — the scrolling box itself is not focusable and never announced.
	 */
	import { cn } from '$lib/utils.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';

	let {
		children,
		class: className,
		viewportClass,
		label,
		...rest
	}: {
		children: Snippet;
		/** Classes for the outer, positioned box — width, margins, alignment. */
		class?: string;
		/** Classes for the element that actually scrolls. */
		viewportClass?: string;
		/** What the hint says. Name the rooms when the screen has a better word. */
		label?: string;
		[key: string]: unknown;
	} = $props();

	let viewport = $state<HTMLDivElement | null>(null);
	let more = $state(false);
	let behind = $state(false);
	let overflowing = $state(false);

	// A pixel of slack in both terms: sub-pixel layout rounding puts scrollWidth a
	// fraction above clientWidth on strips that fit perfectly well, and a browser
	// scrolled to the end lands a fraction short of the arithmetic end.
	const measure = () => {
		const element = viewport;
		if (!element) return;
		const extra = element.scrollWidth - element.clientWidth;
		overflowing = extra > 1;
		more = extra - element.scrollLeft > 1;
		behind = element.scrollLeft > 1;
	};

	/**
	 * A click moves by most of the box, not by a column: this component is a strip
	 * of rooms on one page, a table on another and a tab bar on a third, and it does
	 * not know what a column is on any of them. Keeping a fifth of the view means
	 * the reader always has something they just saw to anchor on, and repeated
	 * clicks still reach the far end.
	 */
	const nudge = (direction: 1 | -1) => {
		const element = viewport;
		if (!element) return;
		element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' });
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

{#if label && overflowing}
	<p class="text-muted-foreground mb-1.5 text-xs" data-testid="scroll-hint" role="status">
		{label} <span aria-hidden="true">→</span>
	</p>
{/if}

<div class={cn('relative', className)} {...rest}>
	<div bind:this={viewport} onscroll={measure} class={cn('overflow-x-auto', viewportClass)}>
		{@render children()}
	</div>

	{#if behind}
		<!-- Same decoration mirrored: once the strip has been moved, what is off to
		     the left is as hidden as what was off to the right, and the button needs
		     something behind it to stay readable over a card. -->
		<div
			aria-hidden="true"
			data-testid="scroll-edge-start"
			class="from-background pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r to-transparent"
		></div>
		<button
			type="button"
			data-testid="scroll-back"
			aria-label="Scroll left"
			onclick={() => nudge(-1)}
			class="bg-background/80 text-muted-foreground hover:text-foreground focus-visible:ring-ring border-border absolute top-1/2 left-1 z-10 -translate-y-1/2 rounded-full border p-1 shadow-sm backdrop-blur-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<ChevronLeftIcon class="size-4" />
		</button>
	{/if}

	{#if more}
		<!-- Decoration, and it has to stay decoration: a visitor who taps where the
		     gradient lies must reach the tab underneath it, and a screenreader must
		     not hear about a shadow. The button beside it is the opposite on both
		     counts — it is the one thing here that is meant to be pressed. -->
		<div
			aria-hidden="true"
			data-testid="scroll-edge"
			class="from-background pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent"
		></div>
		<button
			type="button"
			data-testid="scroll-on"
			aria-label="Scroll right"
			onclick={() => nudge(1)}
			class="bg-background/80 text-muted-foreground hover:text-foreground focus-visible:ring-ring border-border absolute top-1/2 right-1 z-10 -translate-y-1/2 rounded-full border p-1 shadow-sm backdrop-blur-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<ChevronRightIcon class="size-4" />
		</button>
	{/if}
</div>
