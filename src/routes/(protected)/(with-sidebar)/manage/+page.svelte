<script lang="ts">
	import AppSelect from '$lib/components/app/app-select.svelte';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { predecessorLine } from '$lib/conference/predecessor';
	import { enhance } from '$lib/forms/enhance';

	let { data, form } = $props();

	let busy = $state(false);

	const dateRange = (startsOn: string | null, endsOn: string | null) => {
		if (!startsOn) return 'Dates not set';
		const start = new Date(startsOn);
		const end = endsOn ? new Date(endsOn) : null;
		const month = { month: 'short', day: 'numeric' } as const;
		const full = { year: 'numeric', month: 'short', day: 'numeric' } as const;
		if (!end) return start.toLocaleDateString('en-GB', full);
		return `${start.toLocaleDateString('en-GB', month)} – ${end.toLocaleDateString('en-GB', full)}`;
	};

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>My events</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-6 py-10">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">My events</h1>
			<p class="text-muted-foreground mt-1 text-sm">The events you organize.</p>
		</div>
		{#if data.canCreate && data.conferences.length > 0}
			<Button href="/manage/new" size="sm">New event</Button>
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
				title="You do not organize an event yet"
				description="Start one — a name and the dates are enough to get going."
				action={{ href: '/manage/new', label: 'Create an event' }}
			/>
		{:else}
			<EmptyState
				class="mt-8"
				title="An event belongs to an organization"
				description="Create yours first, then you can start an event under it. Or ask an organizer to add you to theirs."
				action={{ href: '/settings/organization/new', label: 'Create an organization' }}
			/>
		{/if}
	{:else}
		<ul class="mt-6 space-y-3">
			{#each data.conferences as conference (conference.id)}
				<li class="border-border rounded-lg border">
					<!--
						The card is no longer one big link: a form inside an <a> cannot
						name the previous edition. The title still opens the dashboard.
					-->
					<a
						href="/manage/{conference.slug}/dashboard"
						class="hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-4 rounded-t-lg p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
					>
						<div>
							<div class="font-medium">{conference.name}</div>
							<div class="text-muted-foreground text-xs">
								{dateRange(conference.startsOn, conference.endsOn)}{conference.venue
									? ` · ${conference.venue}`
									: ''}
							</div>
							{#if conference.predecessor}
								<p class="text-muted-foreground mt-1 text-xs" data-testid="predecessor-line">
									{predecessorLine(conference.predecessor.name)}
								</p>
							{/if}
						</div>
						<StatusBadge status={conference.status} />
					</a>
					{#if conference.predecessorOptions.length > 0}
						<form
							method="POST"
							action="?/predecessor"
							class="border-border flex flex-wrap items-end gap-2 border-t px-4 py-3"
							use:enhance={submitting}
						>
							<input type="hidden" name="conferenceId" value={conference.id} />
							<div class="min-w-40 flex-1">
								<AppSelect
									name="predecessorId"
									size="sm"
									placeholder="Previous edition"
									aria-label="Previous edition of {conference.name}"
									testId="predecessor-select"
									value={conference.predecessor ? String(conference.predecessor.id) : 'none'}
									options={[
										{ value: 'none', label: 'No previous edition' },
										...conference.predecessorOptions.map((option) => ({
											value: String(option.id),
											label: option.name
										}))
									]}
								/>
							</div>
							<Button type="submit" size="sm" disabled={busy} data-testid="predecessor-save">
								Save
							</Button>
							{#if form && form.conferenceId === conference.id && form.error}
								<p class="text-destructive w-full text-xs">{form.error}</p>
							{/if}
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
