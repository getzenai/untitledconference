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
	import { formatScore } from '$lib/conference/scoring';
	import SpeakerHistoryPanel from '$lib/components/app/conference/speaker-history.svelte';
	import ReviewScorecardForm from '$lib/components/app/conference/review-scorecard-form.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import FilePreviewSheet from '$lib/components/file-preview-sheet.svelte';
	import AnswerText from '$lib/components/app/conference/answer-text.svelte';
	import ReviewFileAnswer from '$lib/components/review-file-answer.svelte';
	import { providePageFocus } from '$lib/chat/page-focus.svelte';
	import { page } from '$app/state';
	import { filenameFrom, type FilePreviewKind } from '$lib/conference/file-preview';

	let { data, form } = $props();

	let preview = $state<{ title: string; src: string; kind: FilePreviewKind } | null>(null);

	const openFile = (value: string, kind: FilePreviewKind) => {
		preview = { title: filenameFrom(value), src: value, kind };
	};

	const s = $derived(data.submission);

	/**
	 * The scorecard is for one submission in one round, and the URL only carries
	 * the submission. The round is the half #659 bound `submit_review` to: with
	 * it missing, "write this up as a 4" can land in a different round than the
	 * one on screen (#683).
	 */
	$effect(() =>
		providePageFocus(page.route.id, {
			submissionId: s.id,
			talk: s.title,
			roundId: s.round.id,
			round: s.round.name
		})
	);

	const stamp = (value: Date | string | null) =>
		value ? new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '';
	const writeConflict = $derived(Boolean(form && 'conflict' in form && form.conflict));
</script>

<FilePreviewSheet bind:preview />

<svelte:head>
	<title>{s.title} — review</title>
</svelte:head>

<a
	href="/review/{data.conference.slug}"
	class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
>
	← Back to reviewing
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

		<!-- One talk, two rounds, two different scorecards — and one URL. Naming the
		     other round here is what makes it reachable at all: the queue counts it
		     as outstanding either way. -->
		{#if s.heldRounds.length > 1}
			<nav aria-label="Review rounds" class="mt-3 flex flex-wrap items-center gap-2 text-xs">
				{#each s.heldRounds as round (round.id)}
					{@const current = round.id === s.round.id}
					<a
						href="?round={round.id}"
						aria-current={current ? 'page' : undefined}
						data-testid="round-link-{round.id}"
						class="rounded-md border px-2 py-1 {current
							? 'border-foreground font-medium'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{round.name}
						<span class="text-muted-foreground">
							<!-- "shut" said the same word for a round that closed last week and one
							     that opens on Tuesday, and the first reading of it is "I missed it"
							     (#464). `label` already tells them apart — "Closed", "Opens in 4
							     days" — and it is the wording the queue and the organizer's table
							     use, so the reviewer meets one vocabulary and not three. -->
							· {round.submitted
								? 'reviewed'
								: round.window.state === 'open'
									? 'to review'
									: round.window.label.toLowerCase()}
						</span>
					</a>
				{/each}
			</nav>
		{/if}

		{#if s.abstract}
			<p class="mt-4 text-sm whitespace-pre-line">{s.abstract}</p>
		{/if}

		{#if s.keyTakeaway}
			<h2 class="mt-4 text-sm font-semibold">What the audience takes away</h2>
			<p class="mt-1 text-sm whitespace-pre-line">{s.keyTakeaway}</p>
		{/if}

		{#if s.answers.length > 0}
			<section class="mt-6">
				<h2 class="text-sm font-semibold">What they answered on the form</h2>
				<dl class="mt-2 space-y-3 text-sm">
					{#each s.answers as answer, i (i)}
						<div>
							<dt class="text-muted-foreground text-xs">{answer.label}</dt>
							<dd class="mt-0.5" data-testid="form-answer" data-kind={answer.kind}>
								{#if answer.value === null || answer.value === ''}
									—
								{:else if answer.kind === 'boolean'}
									{answer.value === 'true' ? 'Yes' : 'No'}
								{:else if answer.kind === 'file'}
									<ReviewFileAnswer value={answer.value} onOpen={openFile} />
								{:else}
									<!-- #477: a recording or a slide deck is the only evidence of how this
									     person presents, and it was body text on the screen where they are
									     scored. -->
									<AnswerText value={answer.value} />
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}

		<!-- #451: the returning-speaker argument, in front of the reviewer while they
		     score. Absent in an anonymised round — the server sends an empty list. -->
		{#if s.speakerHistory.length > 0}
			<section class="mt-6">
				<h2 class="text-sm font-semibold">Speaker history</h2>
				<div class="mt-2">
					<SpeakerHistoryPanel history={s.speakerHistory} />
				</div>
			</section>
		{/if}

		<section class="mt-6">
			<h2 class="text-sm font-semibold">What the rest of the committee said</h2>

			{#if s.peersWithheld}
				<p
					class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-2 rounded-md border p-3 text-sm"
				>
					Hidden until you review your own. This conference reviews blind first, so nobody's score
					anchors yours; everything opens up the moment you submit.
				</p>
			{:else if s.peers.length === 0}
				<p class="text-muted-foreground mt-2 text-sm">
					{s.peersPending === 0
						? 'Nobody else has been assigned this one.'
						: s.peersPending === 1
							? 'One other reviewer has this one and has not reviewed yet.'
							: `${s.peersPending} other reviewers have this one and have not reviewed yet.`}
				</p>
			{:else}
				<ul class="mt-2 space-y-3">
					{#each s.peers as peer (peer.id)}
						<li class="border-border rounded-md border p-3" data-testid="peer-review">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="min-w-0">
									<span class="text-sm font-medium">{peer.reviewer}</span>
									<!-- Round names the scorecard — multi-round talks no longer look like one schema. -->
									<span class="text-muted-foreground mt-0.5 block text-xs">{peer.roundName}</span>
								</div>
								<span class="flex items-center gap-2">
									<span class="text-sm tabular-nums">{formatScore(peer.score)}</span>
									<!-- Only submitted peers reach this list; an unfiled one is a count above. -->
									<StatusBadge status="submitted" label={`Reviewed ${stamp(peer.submittedAt)}`} />
								</span>
							</div>
							{#if peer.scores.length > 0}
								<dl class="text-muted-foreground mt-2 space-y-1 text-xs">
									{#each peer.scores as score, si (si)}
										<div class="flex flex-wrap gap-x-1">
											<dt class="text-muted-foreground">{score.criterion}</dt>
											<dd class="text-foreground tabular-nums">
												{score.valueText ?? score.value ?? '—'}
											</dd>
										</div>
									{/each}
								</dl>
							{/if}
							{#if peer.comment}
								<div class="mt-2">
									<p class="text-muted-foreground text-xs">Overall comment</p>
									<p class="mt-0.5 text-sm whitespace-pre-line">{peer.comment}</p>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if s.peersPending > 0}
					<p class="text-muted-foreground mt-2 text-sm">
						{s.peersPending === 1
							? 'One more reviewer has not reviewed yet.'
							: `${s.peersPending} more reviewers have not reviewed yet.`}
					</p>
				{/if}
			{/if}
		</section>
	</article>

	<div>
		{#if writeConflict}
			<div class="mb-3 flex flex-wrap gap-2">
				<a
					href="?round={s.round.id}"
					class="border-border hover:bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
					data-testid="review-keep-saved">Keep the saved version</a
				>
				<button
					type="submit"
					form="review-scorecard"
					name="intent"
					value="draft"
					class="bg-primary text-primary-foreground inline-flex items-center rounded-md px-3 py-1.5 text-sm"
					data-testid="review-overwrite">Overwrite with what I typed</button
				>
			</div>
		{/if}
		<ReviewScorecardForm
			submission={s}
			conferenceSlug={data.conference.slug}
			ownerId={data.user?.id ?? ''}
			{form}
		/>
	</div>
</div>
