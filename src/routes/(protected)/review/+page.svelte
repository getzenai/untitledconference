<script lang="ts">
	import EmptyState from '$lib/components/empty-state.svelte';
	import ShellAccountLinks from '$lib/components/shell-account-links.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Reviewing</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-6 py-10">
	<div class="mb-4">
		<ShellAccountLinks />
	</div>
	<h1 class="text-lg font-semibold tracking-tight">Reviewing</h1>
	<p class="text-muted-foreground mt-1 text-sm">The events whose programme you help choose.</p>

	{#if data.conferences.length === 0}
		<EmptyState
			class="mt-8"
			title="Nothing to review yet"
			description="You are not on a review committee. An organizer adds you to a review round, and the submissions assigned to you appear here."
			action={{ href: '/home', label: 'Back to the dashboard' }}
		/>
	{:else}
		<ul class="mt-6 space-y-3">
			{#each data.conferences as conference (conference.id)}
				<li>
					<a
						href="/review/{conference.slug}"
						class="border-border hover:bg-muted/50 focus-visible:ring-ring block rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
					>
						<div class="text-sm font-semibold">{conference.name}</div>
						<div class="text-muted-foreground text-xs">{conference.venue ?? 'Venue not set'}</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
