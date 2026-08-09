<script lang="ts">
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';

	let { data } = $props();

	const dateRange = (startsOn: string | null, endsOn: string | null) => {
		if (!startsOn) return 'Dates not set';
		const start = new Date(startsOn);
		const end = endsOn ? new Date(endsOn) : null;
		const month = { month: 'short', day: 'numeric' } as const;
		const full = { year: 'numeric', month: 'short', day: 'numeric' } as const;
		if (!end) return start.toLocaleDateString('en-GB', full);
		return `${start.toLocaleDateString('en-GB', month)} – ${end.toLocaleDateString('en-GB', full)}`;
	};
</script>

<svelte:head>
	<title>My conferences</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-6 py-10">
	<h1 class="text-lg font-semibold tracking-tight">My conferences</h1>
	<p class="text-muted-foreground mt-1 text-sm">The events you organize.</p>

	{#if data.conferences.length === 0}
		<EmptyState
			class="mt-8"
			title="You do not organize a conference yet"
			description="Ask an organizer to add you to their event, or start one of your own."
			action={{ href: '/home', label: 'Back to the dashboard' }}
		/>
	{:else}
		<ul class="mt-6 space-y-3">
			{#each data.conferences as conference (conference.id)}
				<li>
					<a
						href="/manage/{conference.slug}/submissions"
						class="border-border hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
					>
						<div>
							<div class="font-medium">{conference.name}</div>
							<div class="text-muted-foreground text-xs">
								{dateRange(conference.startsOn, conference.endsOn)}{conference.venue
									? ` · ${conference.venue}`
									: ''}
							</div>
						</div>
						<StatusBadge status={conference.status} />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
