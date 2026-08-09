<script lang="ts">
	/**
	 * The reviewer's queue (ABS-05).
	 *
	 * Two sorts, because a reviewer and a chair look for opposite things: fewest
	 * reviews first is the working list, highest score first is the decision agenda.
	 * Both are URL state, so either is a link somebody can send.
	 */
	import { QUEUE_SORTS } from '$lib/conference/review-visibility';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { page } from '$app/state';

	let { data } = $props();

	const base = $derived(`/review/${data.conference.slug}`);
	const done = $derived(data.queue.filter((row) => row.ownReviewSubmitted).length);
	const blind = $derived(data.conference.reviewVisibility === 'blind_until_reviewed');
	const current = $derived(QUEUE_SORTS.find((s) => s.value === data.sort) ?? QUEUE_SORTS[0]);
</script>

<svelte:head>
	<title>My review queue — {data.conference.name}</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">My review queue</h1>
		<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
			{done} of {data.queue.length} reviewed
			{#if blind}
				· other reviews stay hidden until you file your own
			{/if}
		</p>
	</div>

	<nav class="flex gap-1 text-sm" aria-label="Sort">
		{#each QUEUE_SORTS as sort (sort.value)}
			<a
				href="{base}?sort={sort.value}"
				aria-current={data.sort === sort.value ? 'true' : undefined}
				title={sort.hint}
				class="rounded-md px-2 py-1 {data.sort === sort.value
					? 'bg-primary text-primary-foreground font-medium'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				{sort.label}
			</a>
		{/each}
	</nav>
</div>

<p class="text-muted-foreground mt-1 text-xs">{current.hint}</p>

{#if data.queue.length === 0}
	<EmptyState
		class="mt-6"
		title="Nothing assigned to you yet"
		description="When an organizer assigns you submissions in a review round, they appear here."
	/>
{:else}
	<div class="border-border mt-4 overflow-hidden rounded-lg border">
		<table class="w-full text-left text-sm">
			<thead class="bg-muted text-muted-foreground text-xs">
				<tr>
					<th class="py-2 pr-4 pl-4 font-medium">Title</th>
					<th class="py-2 pr-4 font-medium">Track</th>
					<th class="py-2 pr-4 font-medium">Reviews</th>
					<th class="py-2 pr-4 font-medium">Score</th>
					<th class="py-2 pr-4 font-medium">Mine</th>
				</tr>
			</thead>
			<tbody>
				{#each data.queue as row (row.submissionId)}
					<tr class="border-border hover:bg-muted/50 border-t">
						<td class="py-2 pr-4 pl-4">
							<!-- A stable permalink per submission: the id, not the position in
							     whatever sort happened to be on. -->
							<a
								href="{base}/{row.submissionId}"
								class="focus-visible:ring-ring font-medium hover:underline focus-visible:ring-[3px] focus-visible:outline-none"
							>
								{row.title}
							</a>
						</td>
						<td class="text-muted-foreground py-2 pr-4">{row.track ?? '—'}</td>
						<td class="py-2 pr-4 tabular-nums">{row.reviewsSubmitted}/{row.reviewsAssigned}</td>
						<td class="py-2 pr-4 tabular-nums">
							{#if row.score === null && blind && !row.ownReviewSubmitted}
								<span class="text-muted-foreground" title="Visible once you have reviewed"
									>hidden</span
								>
							{:else}
								{formatScore(row.score)}
							{/if}
						</td>
						<td class="py-2 pr-4">
							<StatusBadge
								status={row.ownReviewSubmitted ? 'submitted' : 'assigned'}
								label={row.ownReviewSubmitted ? 'Reviewed' : 'To do'}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<p class="text-muted-foreground mt-3 text-xs">
	Permalink for this view: <code>{page.url.pathname}?sort={data.sort}</code>
</p>
