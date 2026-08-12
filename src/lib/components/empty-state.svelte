<script lang="ts">
	/**
	 * R5 in one place: an empty screen names what is missing *and* links to the
	 * action that fills it.
	 *
	 * Six public surfaces shipped the same dead-end paragraph. A component makes
	 * the next step a required thought rather than a remembered one — if there
	 * genuinely is no next step, you have to say so by leaving `action` off.
	 */

	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		title,
		description,
		action,
		goose = true,
		class: className,
		children
	}: {
		title: string;
		description?: string;
		/** The way out. Leave it off only when the user genuinely cannot act. */
		action?: { href: string; label: string };
		/** The mascot. Off for empty states inside a dense working surface. */
		goose?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<div
	data-slot="empty-state"
	class={cn(
		'border-border flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center',
		className
	)}
>
	{#if goose}
		<!-- Inline SVG rather than an image tag: the drawing is one path plus a bill, and inlining
		     is what lets it inherit the text colour instead of shipping a second
		     file for dark mode. The bill is the only warm surface on the page.
		     Same geometry as static/mascot/goose.svg — that copy is for README and
		     marketing, where currentColor buys nothing. -->
		<svg
			viewBox="0 0 100 125"
			class="mb-1 h-16 w-auto text-black dark:text-neutral-950"
			fill="none"
			stroke="currentColor"
			stroke-width="2.3"
			stroke-linejoin="round"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<path
				d="M50 4C60 4 66 11 66 21 66 28 63 32 62 37 61 41 61 45 60 49 77 54 90 67 90 85 90 94 86 100 79 104 71 108 61 110 50 110 28 110 10 102 10 85 10 67 23 54 40 49 39 45 39 41 38 37 37 32 34 28 34 21 34 11 40 4 50 4Z"
				class="fill-white dark:fill-neutral-300"
			/>
			<path d="M76 66C75 80 70 90 61 96" stroke-width="1.5" />
			<path d="M41 110 39 117M39 117 28 122Q39 124 50 122Z" fill="var(--act)" />
			<path d="M59 110 61 117M61 117 50 122Q61 124 72 122Z" fill="var(--act)" />
			<circle cx="43.5" cy="16" r="1.8" class="fill-black dark:fill-neutral-950" stroke="none" />
			<circle cx="56.5" cy="16" r="1.8" class="fill-black dark:fill-neutral-950" stroke="none" />
			<path d="M37 23Q50 18 63 23Q50 33 37 23Z" fill="var(--act)" stroke-width="1.5" />
		</svg>
	{/if}

	<p class="text-sm font-medium">{title}</p>

	{#if description}
		<p class="text-muted-foreground max-w-prose text-sm">{description}</p>
	{/if}

	{#if action}
		<a
			href={action.href}
			class="focus-visible:ring-ring mt-1 text-sm font-medium underline underline-offset-4 focus-visible:ring-[3px] focus-visible:outline-none"
		>
			{action.label}
		</a>
	{/if}

	{@render children?.()}
</div>
