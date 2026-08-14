<script lang="ts">
	/**
	 * The reviewer's shell.
	 *
	 * Deliberately not the organizer's conference rail: CFP-10 asks that a reviewer
	 * sees no controls for this conference and no organizer capability. The shared
	 * app sidebar only switches between the user's role hubs; this local shell has
	 * one conference destination, their queue.
	 *
	 * Account and cross-role navigation stay in the shared application sidebar;
	 * this local header only identifies the conference-specific review queue.
	 */
	let { data, children } = $props();
</script>

<div class="bg-background text-foreground min-h-svh">
	<header class="border-border bg-card border-b px-6 py-3">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
			<a href="/review/{data.conference.slug}" class="text-sm font-semibold tracking-tight">
				{data.conference.name}
				<span class="text-muted-foreground ml-2 text-xs font-normal">Review committee</span>
			</a>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-6">
		{@render children()}
	</main>
</div>
