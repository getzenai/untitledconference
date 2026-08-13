<script lang="ts">
	/**
	 * The sticky top bar every pre-account page shares (from the landing page,
	 * #266).
	 *
	 * Before this the landing page drew its own header and the auth pages drew a
	 * lone wordmark in a card, so signing in or registering meant leaving the
	 * product behind — no logo, no theme toggle, no way back but a text link. This
	 * gives login, register, and the rest of the auth pages the same identity as
	 * the landing page: goose, wordmark, theme toggle.
	 *
	 * The two things that differ per page are left to the caller. The landing page
	 * passes its section anchors (`#product` & co, via `nav`) and its sign-in
	 * buttons (`actions`); the auth pages pass neither, because `#product` would
	 * point at a section that is not there and a "Sign in" button next to a sign-in
	 * form is self-referential.
	 */
	import Goose from '$lib/components/goose.svelte';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import type { Snippet } from 'svelte';

	let {
		selfHref,
		nav,
		actions
	}: {
		/** Where the brand mark and wordmark link. The landing page points `/`, or `/?home=0` for a signed-in reader. */
		selfHref: string;
		/** Landing-only section links. Auth pages omit them. */
		nav?: Snippet;
		/** The sign-in / sign-up pair. Auth pages omit them. */
		actions?: Snippet;
	} = $props();
</script>

<header class="border-border/70 bg-background/90 sticky top-0 z-50 border-b backdrop-blur-xl">
	<div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
		<a
			href={selfHref}
			class="focus-visible:ring-ring flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<Goose silent class="h-9 w-8" />
			<span>untitledconference</span>
		</a>

		{#if nav}
			<nav aria-label="Landing page" class="hidden items-center gap-6 md:flex">
				{@render nav()}
			</nav>
		{/if}

		<div class="flex items-center gap-1.5 sm:gap-2">
			<ModeToggle class="hidden sm:inline-flex" />
			{#if actions}
				{@render actions()}
			{/if}
		</div>
	</div>
</header>
