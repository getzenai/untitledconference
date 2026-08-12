<script lang="ts">
	/**
	 * The reviewer's queue (ABS-05).
	 *
	 * Two sorts, because a reviewer and a chair look for opposite things: fewest
	 * reviews first is the working list, highest score first is the decision agenda.
	 * Both are URL state, so either is a link somebody can send.
	 */
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { QUEUE_SORTS } from '$lib/conference/review-visibility';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import ScrollTable from '$lib/components/app/conference/scroll-table.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { page } from '$app/state';

	let { data } = $props();

	const base = $derived(`/review/${data.conference.slug}`);
	// Withdrawn talks are out of the denominator: they ask nothing of this reviewer,
	// and counting them would make a finished queue read as unfinished forever.
	const outstanding = $derived(data.queue.filter((row) => !row.withdrawn));
	const done = $derived(outstanding.filter((row) => row.ownReviewSubmitted).length);
	const blind = $derived(data.conference.reviewVisibility === 'blind_until_reviewed');
	const current = $derived(QUEUE_SORTS.find((s) => s.value === data.sort) ?? QUEUE_SORTS[0]);

	/**
	 * The two sorts, moved onto the columns they order.
	 *
	 * They used to be a separate row of tabs above the table, which meant the screen
	 * said "ordered by coverage" in one place and showed a Reviews column in another,
	 * and the reader had to connect them. On the header the control IS the column: one
	 * representation, and the same convention the organizer's table already uses.
	 *
	 * Only two sorts exist server-side and neither is a direction — `coverage` is
	 * fewest reviews first, `score` is highest first — so these are not toggles. A
	 * click picks a sort; the active one has no "off", because a table has to come out
	 * of the loader in some order and there is no third one to fall back to.
	 */
	const sortHref = (value: (typeof QUEUE_SORTS)[number]['value']) => `${base}?sort=${value}`;
</script>

<svelte:head>
	<title>My review queue — {data.conference.name}</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">My review queue</h1>
		<p class="text-muted-foreground mt-0.5 text-sm tabular-nums">
			{done} of {outstanding.length} reviewed
			{#if blind}
				· other reviews stay hidden until you file your own
			{/if}
		</p>
	</div>

	<p class="text-muted-foreground text-sm">
		<span class="text-foreground font-medium">{current.label}.</span>
		{current.hint}
	</p>
</div>

{#if data.queue.length === 0}
	<EmptyState
		class="mt-6"
		title="Nothing assigned to you yet"
		description="When an organizer assigns you submissions in a review round, they appear here."
	/>
{:else}
	{#snippet sortable(
		label: string,
		value: (typeof QUEUE_SORTS)[number]['value'],
		hint: string,
		direction: 'ascending' | 'descending'
	)}
		{@const active = data.sort === value}
		<!-- The direction is a property of the sort, not of a toggle: `coverage` means
		     fewest reviews first (ascending) and `score` means highest first
		     (descending), and `aria-sort` has to say which — an arrow that always points
		     down would be lying on one of the two columns. -->
		<th
			class="py-2 pr-4 font-medium {value === 'title' ? 'pl-4' : ''}"
			aria-sort={active ? direction : 'none'}
		>
			<a
				href={sortHref(value)}
				data-testid="sort-by-{value}"
				aria-label={active ? `Sorted: ${hint}` : `Sort: ${hint}`}
				title={hint}
				aria-current={active ? 'true' : undefined}
				class="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm focus-visible:ring-[3px] focus-visible:outline-none {active
					? 'text-foreground'
					: ''}"
			>
				{label}
				<!-- An icon, not an arrow character: "↕" is emoji-eligible and macOS renders it
				     as a blue emoji tile next to a grey text "↑", so the two headers of the same
				     table disagreed about what a sort indicator looks like. -->
				{#if active}
					{#if direction === 'ascending'}
						<ArrowUpIcon aria-hidden="true" class="size-3.5" />
					{:else}
						<ArrowDownIcon aria-hidden="true" class="size-3.5" />
					{/if}
				{:else}
					<ChevronsUpDownIcon aria-hidden="true" class="size-3.5" />
				{/if}
			</a>
		</th>
	{/snippet}

	<ScrollTable class="mt-4" label="Scroll sideways for score and your own status">
		<table class="w-full min-w-lg text-left text-sm">
			<thead class="bg-muted text-muted-foreground text-xs">
				<tr>
					{@render sortable('Title', 'title', 'alphabetical by title', 'ascending')}
					{@render sortable('Track', 'track', 'alphabetical by track', 'ascending')}
					{@render sortable('Reviews', 'coverage', 'fewest reviews first', 'ascending')}
					{@render sortable('Score', 'score', 'highest score first', 'descending')}
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
							<!-- Which rounds this talk sits in for me. One row per submission, so
							     without this a reviewer holding it in two rounds cannot tell that
							     finishing one leaves the other open. -->
							{#if row.rounds.length > 1}
								<span class="text-muted-foreground mt-0.5 block text-xs">
									{row.rounds.join(' · ')}
								</span>
							{/if}
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
								status={row.withdrawn
									? 'withdrawn'
									: row.ownReviewSubmitted
										? 'submitted'
										: 'assigned'}
								label={row.withdrawn ? 'Withdrawn' : row.ownReviewSubmitted ? 'Reviewed' : 'To do'}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</ScrollTable>
{/if}

<p class="text-muted-foreground mt-3 text-xs">
	Permalink for this view: <code>{page.url.pathname}?sort={data.sort}</code>
</p>
