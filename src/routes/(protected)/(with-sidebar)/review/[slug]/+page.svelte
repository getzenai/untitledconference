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
	import { ROUND_WINDOW_TONES } from '$lib/conference/round-window';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import ScrollTable from '$lib/components/app/conference/scroll-table.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import ReviewerChat from '$lib/components/app/conference/reviewer-chat.svelte';

	let { data } = $props();

	const base = $derived(`/review/${data.conference.slug}`);
	/**
	 * What just happened, said out loud (#463).
	 *
	 * Recusing redirects here, and until now the only evidence was a row that had
	 * quietly changed shape — the reviewer was left to infer their own action from a
	 * table. The title travels in the query and the loader hands it over, so the
	 * sentence can name the talk; an empty one still gets the sentence, because the
	 * redirect itself is proof the action ran.
	 */
	const recusedTitle = $derived(data.recused);
	// Withdrawn talks are out of the denominator: they ask nothing of this reviewer,
	// and counting them would make a finished queue read as unfinished forever.
	const outstanding = $derived(data.queue.filter((row) => !row.withdrawn));
	const done = $derived(outstanding.filter((row) => row.ownReviewSubmitted).length);
	/**
	 * The number a volunteer with a free evening came for (#464).
	 *
	 * "9 of 22 reviewed" answers how far the season has got; it does not answer
	 * *what is mine to do tonight*, and the difference used to be invisible until
	 * you opened each row — 22 said To do, 9 could actually be filed. A row waits
	 * if its own review is outstanding and the round that speaks for it is open;
	 * the server decides which round that is, so this counts rather than judges.
	 */
	const waiting = $derived(
		outstanding.filter((row) => !row.ownReviewSubmitted && row.window.state === 'open').length
	);
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
	<title>Reviewing — {data.conference.name}</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-lg font-semibold tracking-tight">Reviewing</h1>
		<p class="text-muted-foreground mt-0.5 text-sm tabular-nums" data-testid="queue-counts">
			{done} of {outstanding.length} reviewed
			{#if waiting > 0}
				· <span class="text-foreground font-medium">{waiting} you can review now</span>
			{:else if done < outstanding.length}
				· nothing you can review today
			{/if}
			{#if blind}
				· other reviews stay hidden until you review your own
			{/if}
		</p>
	</div>

	<p class="text-muted-foreground text-sm">
		<span class="text-foreground font-medium">{current.label}.</span>
		{current.hint}
	</p>
</div>

{#if recusedTitle !== null}
	<p
		class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-4 rounded-md border px-3 py-2 text-sm"
		role="status"
		data-testid="recused-notice"
	>
		{#if recusedTitle}
			You are no longer assigned to “{recusedTitle}”.
		{:else}
			You are no longer assigned to that talk.
		{/if}
		The organizers have it back and can assign it to someone else — or to you again.
	</p>
{/if}

{#if data.queue.length === 0}
	<EmptyState
		class="mt-6"
		title="Nothing assigned to you yet"
		description="When an organizer assigns you talks in a review round, they appear here."
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
					<!-- The reviewer's own column is a sort like the others now (#465): the
					     queue opened on "fewest reviews first", which is what the chair
					     wants to know, and the one column about this person's own work was
					     the only dead header in the row. -->
					{@render sortable(
						'Mine',
						'mine',
						'what you can review now, then what you are waiting on',
						'ascending'
					)}
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
							<!-- Linked, not just listed (#294): both rounds open means the bare
							     permalink can only reach the first, and the second round's
							     scorecard is a different form with different questions. -->
							{#if row.rounds.length > 1}
								<span class="text-muted-foreground mt-0.5 block text-xs">
									{#each row.rounds as round, i (round.id)}{#if i > 0}<span aria-hidden="true">
												·
											</span>{/if}<a
											href="{base}/{row.submissionId}?round={round.id}"
											data-testid="queue-round-{row.submissionId}-{round.id}"
											class="hover:text-foreground underline underline-offset-2"
											>{round.name}{round.submitted ? ' (reviewed)' : ''}</a
										>{/each}
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
							<!-- "To review" on a round that is shut is an instruction the reviewer cannot
							     follow (ABS-01), so the window replaces it — but only while the review
							     is outstanding: one already reviewed stays "Reviewed" whether or not the
							     round has since closed. -->
							{#if !row.withdrawn && !row.ownReviewSubmitted && row.window.state !== 'open'}
								<StatusBadge
									status={row.window.state}
									tone={ROUND_WINDOW_TONES[row.window.state]}
									label={row.window.label}
								/>
							{:else}
								<StatusBadge
									status={row.withdrawn
										? 'withdrawn'
										: row.ownReviewSubmitted
											? 'submitted'
											: 'assigned'}
									label={row.withdrawn
										? 'Withdrawn'
										: row.ownReviewSubmitted
											? 'Reviewed'
											: 'To review'}
								/>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</ScrollTable>
{/if}

{#if data.chatEnabled}
	<ReviewerChat slug={data.conference.slug} />
{/if}
