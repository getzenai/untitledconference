<script lang="ts">
	/**
	 * The acceptance call (#444).
	 *
	 * Two things, and nothing else: what is left, and what this member is fighting
	 * for. The pile lives on /submissions; this screen is for the forty minutes
	 * where a committee argues one talk at a time and the winning argument is
	 * usually arithmetic.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { formUpdateOptions, type FormResetKind } from '$lib/conference/form-reset';
	import { slotCount, slotSentence } from '$lib/conference/decision-room';
	import { formatScore } from '$lib/conference/scoring';
	import EmptyState from '$lib/components/empty-state.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();

	let busy = $state(false);
	/** Open while the organizer types the numbers; shut for the rest of the call. */
	let editingSlots = $state(false);

	const submitting = (kind: FormResetKind) => () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions(kind));
			} finally {
				busy = false;
			}
		};
	};

	const total = $derived(slotCount(data.board.total));
	const trackCounts = $derived(data.board.tracks.map(slotCount));
	const base = $derived(`/manage/${data.conference.slug}`);
	const capacityValue = (capacity: number | null) => (capacity === null ? '' : String(capacity));
</script>

<svelte:head>
	<title>Decision meeting — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<h1 class="text-lg font-semibold tracking-tight">Decision meeting</h1>
	<p class="text-muted-foreground mt-0.5 text-sm">
		The room where talks get accepted one at a time. Each committee member's own ranking is a tab,
		best first, and the slot count above updates as you decide. The pile itself — filters, bulk
		decisions, export — stays on
		<a class="underline underline-offset-4" href="{base}/submissions">Submissions</a>.
	</p>
</div>

<div class="space-y-5 px-6 py-5">
	{#if form?.message}
		<p
			class="border-status-good text-status-good max-w-2xl rounded-md border px-3 py-2 text-sm"
			role="status"
			data-testid="decisions-feedback"
		>
			{form.message}
		</p>
	{/if}

	<section class="border-border bg-card rounded-lg border p-4" data-testid="slot-board">
		<div class="flex flex-wrap items-baseline justify-between gap-3">
			<div>
				<h2 class="text-sm font-semibold">Slots</h2>
				<p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="slot-total">
					{#if total.remaining === null}
						{total.accepted} accepted
					{:else}
						{total.remaining} left
					{/if}
				</p>
				<p class="text-muted-foreground text-sm" data-testid="slot-total-sentence">
					{slotSentence(total)}
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				onclick={() => (editingSlots = !editingSlots)}
				data-testid="slot-edit-toggle"
			>
				{editingSlots ? 'Close' : total.capacity === null ? 'Set slots' : 'Edit slots'}
			</Button>
		</div>

		{#if trackCounts.length > 0}
			<ul class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each trackCounts as track (track.id)}
					<li class="border-border rounded-md border px-3 py-2" data-testid="slot-track">
						<div class="flex items-baseline justify-between gap-2">
							<span class="truncate text-sm font-medium">{track.name}</span>
							<span class="text-sm tabular-nums">
								{track.remaining === null ? track.accepted : track.remaining}
							</span>
						</div>
						<p class="text-muted-foreground mt-0.5 text-xs">{slotSentence(track)}</p>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.board.sponsorHolds > 0}
			<!--
				Stated, not subtracted (#450). A hold is a slot the committee cannot give
				to a talk until someone releases it on the agenda — and an unsold one is
				exactly the inventory the room asks about late in the call.
			-->
			<p class="text-muted-foreground mt-3 text-xs" data-testid="slot-sponsor-holds">
				{data.board.sponsorHolds} sponsor
				{data.board.sponsorHolds === 1 ? 'slot is' : 'slots are'} held on the grid with no talk in
				{data.board.sponsorHolds === 1 ? 'it' : 'them'}. Release
				{data.board.sponsorHolds === 1 ? 'it' : 'them'} on the
				<a class="underline underline-offset-4" href="{base}/agenda">agenda</a> to give the slot back
				to the programme.
			</p>
		{/if}

		{#if data.board.untracked > 0}
			<p class="text-muted-foreground mt-3 text-xs" data-testid="slot-untracked">
				{data.board.untracked} accepted talk{data.board.untracked === 1 ? '' : 's'} sit outside every
				track and count only towards the total.
			</p>
		{/if}

		{#if editingSlots}
			<form
				method="POST"
				action="?/capacity"
				use:enhance={submitting('edit')}
				class="border-border mt-4 space-y-3 border-t pt-4"
				data-testid="slot-form"
			>
				<label class="block max-w-xs">
					<span class="text-sm font-medium">Slots in the programme</span>
					<input
						name="total"
						type="number"
						min="0"
						step="1"
						inputmode="numeric"
						value={capacityValue(data.board.total.capacity)}
						placeholder="Not said"
						class="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
					/>
				</label>
				{#each data.board.tracks as track (track.id)}
					<label class="block max-w-xs">
						<span class="text-sm font-medium">{track.name}</span>
						<input
							name="track-{track.id}"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							value={capacityValue(track.capacity)}
							placeholder="Not said"
							class="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
						/>
					</label>
				{/each}
				<p class="text-muted-foreground text-xs">
					Leave a field empty and we say nothing about it. Empty is not zero — a committee should
					never be stopped by a limit we invented.
				</p>
				<Button type="submit" size="sm" disabled={busy}>Save slots</Button>
			</form>
		{/if}
	</section>

	{#if data.seats.length === 0}
		<EmptyState
			title="Nobody has handed in a review yet"
			description="A lobbying queue is a member's own ranking, so it needs their scores. Assign reviewers from the reviewer pool, and this room fills up as reviews come in."
		/>
	{:else}
		<nav class="flex flex-wrap gap-2" aria-label="Committee" data-testid="committee-tabs">
			{#each data.seats as seat (seat.userId)}
				{@const active = seat.userId === data.selectedUserId}
				<a
					href="?member={seat.userId}"
					aria-current={active ? 'page' : undefined}
					data-testid="committee-tab"
					class="rounded-md border px-3 py-1.5 text-sm {active
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-card hover:bg-accent'}"
				>
					{seat.name}
					<span class="ml-1 tabular-nums opacity-70">{seat.queueLength}</span>
				</a>
			{/each}
		</nav>

		<section class="border-border bg-card rounded-lg border" data-testid="lobbying-queue">
			<table class="w-full text-sm">
				<caption class="sr-only">Ranked by this member's own score, best first</caption>
				<thead class="text-muted-foreground border-border border-b text-left text-xs">
					<tr>
						<th scope="col" class="px-4 py-2 font-medium">Talk</th>
						<th scope="col" class="px-4 py-2 font-medium">Track</th>
						<th scope="col" class="px-4 py-2 text-right font-medium">Theirs</th>
						<th scope="col" class="px-4 py-2 text-right font-medium">Everyone</th>
						<th scope="col" class="px-4 py-2 font-medium">Status</th>
						<th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Decide</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.queue as row (row.submissionId)}
						<tr class="border-border border-b align-top last:border-0">
							<td class="px-4 py-3">
								<a
									class="font-medium underline-offset-4 hover:underline"
									href="{base}/submissions/{row.submissionId}"
								>
									{row.title}
								</a>
								{#if row.myComment}
									<p class="text-muted-foreground mt-1 max-w-prose text-xs italic">
										“{row.myComment}”
									</p>
								{/if}
							</td>
							<td class="text-muted-foreground px-4 py-3">{row.track ?? '—'}</td>
							<td class="px-4 py-3 text-right font-medium tabular-nums">
								{formatScore(row.myScore)}
							</td>
							<td class="text-muted-foreground px-4 py-3 text-right tabular-nums">
								{formatScore(row.overallScore)}
								<span class="text-xs">({row.reviewsSubmitted})</span>
							</td>
							<td class="px-4 py-3"><StatusBadge status={row.status} /></td>
							<td class="px-4 py-3">
								<form
									method="POST"
									action="?/decide"
									use:enhance={submitting('edit')}
									class="flex justify-end gap-1"
								>
									<input type="hidden" name="id" value={row.submissionId} />
									{#if row.status !== 'accepted'}
										<Button
											type="submit"
											size="sm"
											name="decision"
											value="accepted"
											disabled={busy}
											data-testid="decide-accept">Accept</Button
										>
									{/if}
									{#if row.status !== 'waitlisted'}
										<Button
											type="submit"
											size="sm"
											variant="outline"
											name="decision"
											value="waitlisted"
											disabled={busy}>Waitlist</Button
										>
									{/if}
									{#if row.status !== 'rejected'}
										<Button
											type="submit"
											size="sm"
											variant="outline"
											name="decision"
											value="rejected"
											disabled={busy}>Reject</Button
										>
									{/if}
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
		<p class="text-muted-foreground text-xs">
			Accepted talks stay in the list. A queue that empties as the call runs hides the fact that
			somebody's number two already got in — and they will argue for it a second time.
		</p>
	{/if}
</div>
