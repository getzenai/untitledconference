<script lang="ts">
	/**
	 * The reviewer's shell.
	 *
	 * Deliberately not the organizer's rail: CFP-10 asks that a reviewer sees no
	 * organizer navigation and no organizer capability. The cheapest way to promise
	 * that is to not build a door — this layout has one destination, their queue.
	 *
	 * Home + Log out live here because this shell is outside (with-sidebar): a
	 * reviewer with one conference is redirected straight to /review/<slug> and
	 * never sees NavUser.
	 */
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import ShellAccountLinks from '$lib/components/shell-account-links.svelte';

	let { data, children } = $props();
</script>

<div class="bg-background text-foreground min-h-svh">
	<header class="border-border bg-card border-b px-6 py-3">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
			<a href="/review/{data.conference.slug}" class="text-sm font-semibold tracking-tight">
				{data.conference.name}
				<span class="text-muted-foreground ml-2 text-xs font-normal">Review committee</span>
			</a>
			<div class="flex shrink-0 items-center gap-3">
				<ShellAccountLinks />
				<ModeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-6">
		{@render children()}
	</main>
</div>
