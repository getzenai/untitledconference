<script lang="ts">
	/**
	 * The reviewer's shell.
	 *
	 * Deliberately not the organizer's rail: CFP-10 asks that a reviewer sees no
	 * organizer navigation and no organizer capability. The cheapest way to promise
	 * that is to not build a door — this layout has one destination, their queue.
	 *
	 * That promise cost the reviewer the way out: arriving here from the app,
	 * nothing on the page led back (#71). One link to their own list of review
	 * assignments is the exit, and it is not organizer navigation — it is the page
	 * they came from.
	 */
	import ModeToggle from '$lib/components/mode-toggle.svelte';

	let { data, children } = $props();
</script>

<div class="bg-background text-foreground min-h-svh">
	<header class="border-border bg-card border-b px-6 py-3">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<a
					href="/review"
					data-testid="review-back"
					class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm focus-visible:ring-[3px] focus-visible:outline-none"
				>
					← Reviewing
				</a>
				<span class="text-border" aria-hidden="true">|</span>
				<a href="/review/{data.conference.slug}" class="text-sm font-semibold tracking-tight">
					{data.conference.name}
					<span class="text-muted-foreground ml-2 text-xs font-normal">Review committee</span>
				</a>
			</div>
			<ModeToggle />
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-6">
		{@render children()}
	</main>
</div>
