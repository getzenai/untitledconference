<script lang="ts">
	/**
	 * One assigned submission and this reviewer's verdict (CFP-11, ABS-03).
	 *
	 * The proposal and the scorecard sit on one screen, because a reviewer who has to
	 * navigate to score is a reviewer who scores from memory.
	 *
	 * What other people wrote appears below — or does not, if the conference runs
	 * `blind_until_reviewed`. In that mode the peer reviews are not on this page at
	 * all; the server never sent them. The notice says so rather than pretending they
	 * do not exist, because "there are three opinions you may not read yet" is honest
	 * and "no reviews" would be a lie.
	 */
	import { enhance } from '$app/forms';
	import { formatScore } from '$lib/conference/scoring';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();

	const s = $derived(data.submission);
	const withdrawn = $derived(s.status === 'withdrawn');
	let busy = $state(false);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};

	const inputClass =
		'border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-1.5 text-sm focus-visible:ring-[3px] focus-visible:outline-none';

	const parseOptions = (raw: string | null): string[] => {
		if (!raw) return [];
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : [];
		} catch {
			return [];
		}
	};

	const stamp = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '';
</script>

<svelte:head>
	<title>{s.title} — review</title>
</svelte:head>

<a
	href="/review/{data.conference.slug}"
	class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
>
	← Back to my queue
</a>

<div class="mt-3 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
	<article>
		<h1 class="text-lg font-semibold tracking-tight">{s.title}</h1>
		<p class="text-muted-foreground mt-0.5 text-sm">
			{[
				s.anonymized ? 'Author hidden for this round' : s.speakers.join(', ') || 'No speaker yet',
				s.track,
				s.sessionFormat,
				s.audienceLevel
			]
				.filter(Boolean)
				.join(' · ')}
		</p>

		{#if s.abstract}
			<p class="mt-4 text-sm whitespace-pre-line">{s.abstract}</p>
		{/if}

		{#if s.keyTakeaway}
			<h2 class="mt-4 text-sm font-semibold">What the audience takes away</h2>
			<p class="mt-1 text-sm whitespace-pre-line">{s.keyTakeaway}</p>
		{/if}

		<section class="mt-6">
			<h2 class="text-sm font-semibold">What the rest of the committee said</h2>

			{#if s.peersWithheld}
				<p
					class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-2 rounded-md border p-3 text-sm"
				>
					Hidden until you file your own review. This conference reviews blind first, so nobody's
					score anchors yours; everything opens up the moment you submit.
				</p>
			{:else if s.peers.length === 0}
				<p class="text-muted-foreground mt-2 text-sm">
					{s.peersPending === 0
						? 'Nobody else has been assigned this one.'
						: s.peersPending === 1
							? 'One other reviewer has this one and has not filed yet.'
							: `${s.peersPending} other reviewers have this one and have not filed yet.`}
				</p>
			{:else}
				<ul class="mt-2 space-y-3">
					{#each s.peers as peer (peer.id)}
						<li class="border-border rounded-md border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="text-sm font-medium">{peer.reviewer}</span>
								<span class="flex items-center gap-2">
									<span class="text-sm tabular-nums">{formatScore(peer.score)}</span>
									<!-- Only submitted peers reach this list; an unfiled one is a count above. -->
									<StatusBadge status="submitted" label={`Reviewed ${stamp(peer.submittedAt)}`} />
								</span>
							</div>
							{#if peer.comment}
								<p class="mt-2 text-sm whitespace-pre-line">{peer.comment}</p>
							{/if}
							{#if peer.scores.length > 0}
								<dl class="text-muted-foreground mt-2 flex flex-wrap gap-x-4 text-xs">
									{#each peer.scores as score, si (si)}
										<div class="flex gap-1">
											<dt>{score.criterion}:</dt>
											<dd class="tabular-nums">{score.valueText ?? score.value ?? '—'}</dd>
										</div>
									{/each}
								</dl>
							{/if}
						</li>
					{/each}
				</ul>
				{#if s.peersPending > 0}
					<p class="text-muted-foreground mt-2 text-sm">
						{s.peersPending === 1
							? 'One more reviewer has not filed yet.'
							: `${s.peersPending} more reviewers have not filed yet.`}
					</p>
				{/if}
			{/if}
		</section>
	</article>

	<form
		method="POST"
		action="?/save"
		use:enhance={submitting}
		class="border-border bg-card h-fit space-y-3 rounded-lg border p-4"
	>
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold">My review</h2>
			<StatusBadge
				status={withdrawn ? 'withdrawn' : s.own.status}
				label={withdrawn ? 'Withdrawn' : s.own.status === 'submitted' ? 'Submitted' : 'Draft'}
			/>
		</div>

		{#if withdrawn}
			<!-- The answers stay readable — a review already filed is still a record of
			     what this reviewer thought — but nothing here asks for more work, and
			     `saveReview` refuses a withdrawn talk regardless of what this page draws. -->
			<p
				class="border-status-bad text-status-bad rounded-md border px-3 py-2 text-sm"
				role="status"
			>
				The speaker withdrew this talk, so it no longer needs a review.
			</p>
		{/if}

		{#if form?.message}
			<p
				class="border-status-good text-status-good rounded-md border px-3 py-2 text-sm"
				role="status"
			>
				{form.message}
			</p>
		{/if}

		{#if s.criteria.length === 0}
			<p class="text-muted-foreground text-sm">
				This round has no scorecard yet — leave your verdict as a comment.
			</p>
		{/if}

		{#each s.criteria as criterion (criterion.id)}
			<label class="block text-sm">
				<span class="text-muted-foreground text-xs">
					<!-- One expression rather than an {#if} block: Svelte trims the whitespace that
					     starts a block, and the label read "Relevance(1–5)" without it. -->
					{criterion.label}{criterion.kind === 'rating' && criterion.scaleMax
						? ` (1–${criterion.scaleMax})`
						: ''}
				</span>

				{#if criterion.kind === 'rating'}
					<input
						type="number"
						name="criterion-{criterion.id}"
						min="0"
						max={criterion.scaleMax ?? undefined}
						step="1"
						value={criterion.value ?? ''}
						class="{inputClass} mt-1 w-full"
					/>
				{:else if criterion.kind === 'select'}
					<AppSelect
						name="criterion-{criterion.id}"
						class="mt-1"
						aria-label={criterion.label}
						placeholder="—"
						value={criterion.valueText ?? ''}
						options={parseOptions(criterion.options).map((option) => ({
							value: option,
							label: option
						}))}
					/>
				{:else}
					<textarea name="criterion-{criterion.id}" rows="2" class="{inputClass} mt-1 w-full"
						>{criterion.valueText ?? ''}</textarea
					>
				{/if}
			</label>
		{/each}

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Comment to the committee</span>
			<textarea name="comment" rows="4" class="{inputClass} mt-1 w-full"
				>{s.own.comment ?? ''}</textarea
			>
		</label>

		<div class="flex flex-wrap gap-2">
			{#if s.own.status === 'submitted'}
				<!-- Already filed: keep edit open, but do not look like a first submit. -->
				<Button
					type="submit"
					name="intent"
					value="submit"
					variant="outline"
					size="sm"
					disabled={busy || withdrawn}
				>
					Update review
				</Button>
				<Button
					type="submit"
					name="intent"
					value="draft"
					variant="ghost"
					size="sm"
					disabled={busy || withdrawn}
				>
					Save progress
				</Button>
			{:else}
				<Button type="submit" name="intent" value="submit" size="sm" disabled={busy || withdrawn}>
					Submit review
				</Button>
				<Button
					type="submit"
					name="intent"
					value="draft"
					variant="outline"
					size="sm"
					disabled={busy || withdrawn}
				>
					Save progress
				</Button>
			{/if}
			{#if s.own.status === 'assigned'}
				<Button
					type="submit"
					name="reviewId"
					value={s.own.reviewId}
					formaction="?/recuse"
					variant="ghost"
					size="sm"
					disabled={busy}
				>
					Recuse myself
				</Button>
			{/if}
		</div>

		<!-- The promise the veterans asked for, written where it is made: a status
		     change is not a notification. -->
		<p class="text-muted-foreground text-xs">
			Submitting counts your review towards coverage. It emails nobody — the organizer decides when
			speakers are told.
		</p>
	</form>
</div>
