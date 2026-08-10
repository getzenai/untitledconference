<script lang="ts">
	import EmptyState from '$lib/components/empty-state.svelte';
	import ShellAccountLinks from '$lib/components/shell-account-links.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';

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
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="mb-2">
				<ShellAccountLinks homeTestId="manage-home-link" />
			</div>
			<h1 class="text-lg font-semibold tracking-tight">My conferences</h1>
			<p class="text-muted-foreground mt-1 text-sm">The events you organize.</p>
		</div>
		{#if data.canCreate && data.conferences.length > 0}
			<Button href="/manage/new" size="sm">New conference</Button>
		{/if}
	</div>

	{#if data.conferences.length === 0}
		<!--
			The landing spot for a brand new organizer, so the action here has to be
			the next step and not a way back. It offered "back to the dashboard",
			which is where they had just come from.
		-->
		{#if data.canCreate}
			<EmptyState
				class="mt-8"
				title="You do not organize a conference yet"
				description="Start one — a name and the dates are enough to get going."
				action={{ href: '/manage/new', label: 'Create a conference' }}
			/>
		{:else}
			<EmptyState
				class="mt-8"
				title="A conference belongs to an organization"
				description="Create yours first, then you can start a conference under it. Or ask an organizer to add you to theirs."
				action={{ href: '/settings/organization/new', label: 'Create an organization' }}
			/>
		{/if}
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
