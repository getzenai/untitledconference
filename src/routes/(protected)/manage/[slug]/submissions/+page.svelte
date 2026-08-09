<script lang="ts">
	/**
	 * The organizer's workplace (journey 2, step 4 — and R7).
	 *
	 * Working density, seven columns, filters above the table rather than behind a
	 * drawer, and the row click opens the detail. The selection plus the bulk bar is
	 * the point of the screen: deciding and assigning happen to many rows at once,
	 * never one at a time. That is the only way the "submissions per hour" measure in
	 * ROLES_AND_JOURNEYS moves.
	 */
	import { enhance } from '$app/forms';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);

	const selected = new SvelteSet<number>();
	let busy = $state(false);

	// A selection that survives a filter change would decide rows the organizer can
	// no longer see — so anything that scrolled out of view drops out of the selection.
	// `untrack` on the write keeps this from re-triggering on its own edit.
	$effect(() => {
		const visible = new Set(data.submissions.map((s) => s.id));
		untrack(() => {
			for (const id of [...selected]) if (!visible.has(id)) selected.delete(id);
		});
	});

	const allVisibleSelected = $derived(
		data.submissions.length > 0 && data.submissions.every((s) => selected.has(s.id))
	);

	const toggleAll = () => {
		if (allVisibleSelected) selected.clear();
		else for (const s of data.submissions) selected.add(s.id);
	};

	const toggle = (id: number) => {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	};

	const STATUSES = [
		'draft',
		'submitted',
		'in_review',
		'accepted',
		'waitlisted',
		'rejected',
		'withdrawn'
	];

	const speakerLine = (speakers: { name: string }[]) =>
		speakers.length === 0
			? '—'
			: speakers.length === 1
				? speakers[0].name
				: `${speakers[0].name} +${speakers.length - 1}`;
</script>

<svelte:head>
	<title>Submissions — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Submissions</h1>
			<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
				{data.counts.total} total · {data.counts.undecided} awaiting a decision · {data.counts
					.unreviewed} unreviewed
			</p>
		</div>
		<Button href="/c/{data.conference.slug}" variant="outline">View the public site</Button>
	</div>
</div>

<div class="px-6 py-5">
	<form
		method="GET"
		class="mb-3 flex flex-wrap items-center gap-2"
		data-testid="submission-filters"
	>
		<Input
			name="q"
			value={data.filters.q ?? ''}
			placeholder="Search title or speaker…"
			class="w-60"
			aria-label="Search submissions"
		/>

		<select
			name="track"
			aria-label="Track"
			class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<option value="">All tracks</option>
			{#each data.facets.tracks as track (track.id)}
				<option value={track.id} selected={data.filters.trackId === track.id}>{track.name}</option>
			{/each}
		</select>

		<select
			name="format"
			aria-label="Format"
			class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<option value="">All formats</option>
			{#each data.facets.formats as format (format.id)}
				<option value={format.id} selected={data.filters.sessionFormatId === format.id}>
					{format.name}
				</option>
			{/each}
		</select>

		<select
			name="status"
			aria-label="Status"
			class="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			<option value="">All statuses</option>
			{#each STATUSES as status (status)}
				<option value={status} selected={data.filters.status?.includes(status)}>
					{status.replace(/_/g, ' ')}
				</option>
			{/each}
		</select>

		<Button type="submit" variant="outline" size="sm">Filter</Button>
		{#if data.filters.q || data.filters.trackId || data.filters.sessionFormatId || data.filters.status?.length}
			<a
				href="{base}/submissions"
				class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
			>
				Clear
			</a>
		{/if}
	</form>

	{#if form?.result}
		<p
			class="border-status-good text-status-good mb-3 rounded-md border px-3 py-2 text-sm"
			role="status"
		>
			{form.result.decided}
			{form.result.decided === 1 ? 'submission' : 'submissions'}
			{form.decision}.
			{#if form.result.sessionsCreated}
				{form.result.sessionsCreated} added to the agenda tray.
			{/if}
			{#if form.result.tasksCreated}
				{form.result.tasksCreated} speaker tasks created.
			{/if}
			{#if form.result.emailsQueued}
				{form.result.emailsQueued} emails queued.
			{/if}
		</p>
	{:else if form?.message}
		<p
			class="border-status-bad text-status-bad mb-3 rounded-md border px-3 py-2 text-sm"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if data.submissions.length === 0}
		<EmptyState
			title={data.filters.q ||
			data.filters.trackId ||
			data.filters.sessionFormatId ||
			data.filters.status?.length
				? 'No submission matches these filters'
				: 'No submissions yet'}
			description={data.filters.q ||
			data.filters.trackId ||
			data.filters.sessionFormatId ||
			data.filters.status?.length
				? 'Widen the filters, or clear them to see the whole pile again.'
				: 'Nothing has come in through the call for papers. Share the link and the table fills itself.'}
			action={{ href: `/c/${data.conference.slug}`, label: 'Open the public conference page' }}
		/>
	{:else}
		<form
			method="POST"
			action="?/decide"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<!-- R3: four automatic consequences are too many to guess, so they are named
			     above the button rather than discovered after it. -->
			<div
				class="border-border bg-muted/40 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
			>
				<p class="text-muted-foreground text-sm">
					{#if selected.size === 0}
						Select rows to decide on them together.
					{:else}
						<span class="text-foreground font-medium tabular-nums">{selected.size} selected</span> · accepting
						also creates the session in the agenda tray, the speaker's tasks and the decision email.
					{/if}
				</p>
				<div class="flex gap-2">
					<Button
						type="submit"
						name="decision"
						value="rejected"
						variant="outline"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Decline
					</Button>
					<Button
						type="submit"
						name="decision"
						value="waitlisted"
						variant="outline"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Waitlist
					</Button>
					<Button
						type="submit"
						name="decision"
						value="accepted"
						size="sm"
						disabled={selected.size === 0 || busy}
					>
						Accept
					</Button>
				</div>
			</div>

			<div class="border-border overflow-hidden rounded-lg border">
				<table class="w-full text-left text-sm">
					<thead class="bg-muted text-muted-foreground sticky top-0 text-xs">
						<tr>
							<th class="w-10 py-2 pr-3 pl-4">
								<input
									type="checkbox"
									class="border-input accent-primary size-4 rounded"
									aria-label="Select every submission in view"
									checked={allVisibleSelected}
									onchange={toggleAll}
								/>
							</th>
							<th class="py-2 pr-4 font-medium">Title</th>
							<th class="py-2 pr-4 font-medium">Speaker</th>
							<th class="py-2 pr-4 font-medium">Track</th>
							<th class="py-2 pr-4 font-medium">Format</th>
							<th class="py-2 pr-4 font-medium">Sponsor</th>
							<th class="py-2 pr-4 font-medium">Score</th>
							<th class="py-2 pr-4 font-medium">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each data.submissions as submission (submission.id)}
							<tr class="border-border hover:bg-muted/50 border-t">
								<td class="py-2 pr-3 pl-4">
									<input
										type="checkbox"
										name="id"
										value={submission.id}
										class="border-input accent-primary size-4 rounded"
										aria-label="Select {submission.title}"
										checked={selected.has(submission.id)}
										onchange={() => toggle(submission.id)}
									/>
								</td>
								<td class="py-2 pr-4">
									<a
										href="{base}/submissions/{submission.id}"
										class="focus-visible:ring-ring font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
									>
										{submission.title}
									</a>
								</td>
								<td class="text-muted-foreground py-2 pr-4">{speakerLine(submission.speakers)}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.track ?? '—'}</td>
								<td class="text-muted-foreground py-2 pr-4">{submission.sessionFormat ?? '—'}</td>
								<td class="py-2 pr-4">
									{#if submission.sponsorTier}
										<!-- R6: internal. The reviewer's view and every public surface load
										     through queries that never select this column at all. -->
										<StatusBadge
											status="internal"
											tone="internal"
											label="{submission.sponsorTier} · internal"
										/>
									{/if}
								</td>
								<td class="py-2 pr-4 tabular-nums">
									{formatScore(submission.score)}
									{#if submission.reviewsAssigned > 0}
										<span class="text-muted-foreground text-xs">
											({submission.reviewsSubmitted}/{submission.reviewsAssigned})
										</span>
									{/if}
								</td>
								<td class="py-2 pr-4"><StatusBadge status={submission.status} /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</form>
	{/if}
</div>
