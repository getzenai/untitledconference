<script lang="ts">
	/**
	 * Journey 2, step 6 — and Ü4.
	 *
	 * Abstract and reviews on ONE screen. The organizer decides with an eye movement,
	 * not a navigation: if the scores sit behind a tab, every decision costs a page
	 * load and the "submissions per hour" measure collapses.
	 *
	 * The right-hand column carries what only this role may see (sponsor tier, R6)
	 * and what the button is about to set off (R3).
	 */
	import { enhance } from '$app/forms';
	import { describeDecision } from '$lib/conference/decision-summary';
	import { formatScore } from '$lib/conference/scoring';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const s = $derived(data.submission);

	let busy = $state(false);

	const stamp = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleDateString('en-GB', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: null;

	const subtitle = $derived(
		[
			s.speakers.map((sp) => sp.name).join(', ') || null,
			s.track,
			s.sessionFormat
				? `${s.sessionFormat}${s.sessionMinutes ? ` (${s.sessionMinutes} min)` : ''}`
				: null,
			stamp(s.submittedAt) ? `submitted ${stamp(s.submittedAt)}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');

	const decided = $derived(s.status === 'accepted' || s.status === 'rejected');
	const inTray = $derived(s.placements.length > 0);

	/**
	 * The slot the talk was actually held in.
	 *
	 * A recording belongs to a confirmed placement, not to a tentative one: a draft
	 * parked on three slots is exactly the state where "which of these was recorded"
	 * has no answer.
	 */
	const scheduled = $derived(s.placements.find((p) => p.status === 'confirmed') ?? null);
</script>

<svelte:head>
	<title>{s.title} — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<a
		href="{base}/submissions"
		class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
	>
		← All submissions
	</a>
	<div class="mt-2 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-lg font-semibold tracking-tight">{s.title}</h1>
				<StatusBadge status={s.status} />
			</div>
			<p class="text-muted-foreground mt-0.5 text-sm">{subtitle}</p>
		</div>

		<form
			method="POST"
			action="?/decide"
			class="flex shrink-0 gap-2"
			use:enhance={() => {
				busy = true;
				// `finally`, not a trailing line: a dropped connection would otherwise
				// leave every button disabled with no way back except a reload.
				return async ({ update }) => {
					try {
						await update();
					} finally {
						busy = false;
					}
				};
			}}
		>
			<Button type="submit" name="decision" value="rejected" variant="outline" disabled={busy}>
				Decline
			</Button>
			<Button type="submit" name="decision" value="waitlisted" variant="outline" disabled={busy}>
				Waitlist
			</Button>
			<Button type="submit" name="decision" value="accepted" disabled={busy}>Accept</Button>
		</form>
	</div>

	{#if form?.result}
		<p class="text-status-good mt-3 text-sm" role="status">
			{describeDecision(form.decision, form.result)}
		</p>
	{:else if form?.message}
		<p class="text-status-bad mt-3 text-sm" role="alert">{form.message}</p>
	{/if}
</div>

<div class="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="space-y-4">
		<section class="border-border bg-card rounded-lg border p-5">
			<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Abstract</h2>
			<p class="mt-2 leading-relaxed whitespace-pre-line">{s.abstract ?? 'No abstract.'}</p>

			{#if s.keyTakeaway || s.audienceLevel}
				<dl class="border-border mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
					{#if s.keyTakeaway}
						<div>
							<dt class="text-muted-foreground">Key takeaway</dt>
							<dd>{s.keyTakeaway}</dd>
						</div>
					{/if}
					{#if s.audienceLevel}
						<div>
							<dt class="text-muted-foreground">Audience level</dt>
							<dd>{s.audienceLevel}</dd>
						</div>
					{/if}
				</dl>
			{/if}

			{#if s.answers.length > 0}
				<!-- Ü2: whatever the organizer added to the form arrives here, or they retype it. -->
				<dl class="border-border mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
					{#each s.answers as answer, i (i)}
						<div>
							<dt class="text-muted-foreground">{answer.label}</dt>
							<dd>{answer.value ?? '—'}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>

		<section class="border-border bg-card rounded-lg border p-5">
			<div class="flex items-baseline justify-between">
				<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Reviews</h2>
				<span class="font-medium tabular-nums">Ø {formatScore(s.score)}</span>
			</div>

			{#if s.reviews.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">Nobody is assigned to this submission yet.</p>
			{:else}
				<ul>
					{#each s.reviews as review (review.id)}
						<li class="border-border border-t py-3 first:mt-3">
							<div class="flex items-baseline justify-between gap-3">
								<span class="font-medium">{review.reviewerName}</span>
								<span class="text-muted-foreground text-sm tabular-nums">
									{#if review.status === 'submitted'}
										{formatScore(review.score)}
									{:else}
										<StatusBadge status={review.status} />
									{/if}
								</span>
							</div>
							{#if review.scores.length > 0}
								<p class="text-muted-foreground mt-1 text-xs tabular-nums">
									{#each review.scores as score, i (i)}
										{i > 0 ? ' · ' : ''}{score.criterion}:
										{score.valueText ??
											`${score.value ?? '—'}${score.scaleMax ? `/${score.scaleMax}` : ''}`}
									{/each}
								</p>
							{/if}
							{#if review.comment}
								<p class="text-muted-foreground mt-1 text-sm">{review.comment}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<div class="space-y-4">
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-medium">{s.speakers.length === 1 ? 'Speaker' : 'Speakers'}</h2>
			{#if s.speakers.length === 0}
				<p class="text-muted-foreground mt-2 text-sm">No speaker on this submission.</p>
			{:else}
				<ul class="mt-2 space-y-3">
					{#each s.speakers as speaker (speaker.id)}
						<li class="flex items-center gap-3">
							{#if speaker.headshotUrl}
								<img
									src={speaker.headshotUrl}
									alt=""
									class="size-9 shrink-0 rounded-full object-cover"
								/>
							{:else}
								<span
									class="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
									aria-hidden="true"
								>
									{initials(speaker.name)}
								</span>
							{/if}
							<div class="min-w-0 text-sm">
								<div class="font-medium">{speaker.name}</div>
								<div class="text-muted-foreground truncate">
									{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ') ||
										speaker.roleLabel ||
										'—'}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if s.sponsorTier}
			<section class="border-border bg-card rounded-lg border p-4">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-sm font-medium">Sponsorship</h2>
					<StatusBadge status="internal" tone="internal" label="internal only" />
				</div>
				<p class="mt-2 text-sm font-medium">{s.sponsorTier}</p>
				{#if s.sponsorNote}
					<p class="text-muted-foreground mt-1 text-sm">{s.sponsorNote}</p>
				{/if}
				<p class="text-muted-foreground mt-2 text-xs">
					Reviewers do not see this, and the public programme shows only the format.
				</p>
			</section>
		{/if}

		<!-- R3 — said before the click, and worded as what the code actually does. -->
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-medium">
				{decided ? 'Accepting did' : 'Accepting will'} automatically
			</h2>
			<ul class="text-muted-foreground mt-2 space-y-1 text-sm">
				<li>· put the talk in the agenda tray as an unscheduled session</li>
				<li>· confirm the speakers for this conference</li>
				<li>· create their tasks from the conference's task template</li>
				<li>· queue the decision email to every speaker</li>
			</ul>
			<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
				Declining or waitlisting an accepted talk takes the session back out of the tray and
				withdraws the tasks nobody has started. A slot you already confirmed stays — that one is
				yours to move.
			</p>
			{#if inTray}
				<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
					Already in the programme as
					{s.placements.map((p) => p.status).join(', ')}.
				</p>
			{/if}
		</section>

		{#if scheduled}
			<!-- #20 stage 1. The conference page dies the day after the event unless
			     something on it keeps working; the recording is that something. -->
			<section class="border-border bg-card rounded-lg border p-4">
				<h2 class="text-sm font-medium">Recording</h2>
				<p class="text-muted-foreground mt-1 text-xs">
					Paste the video link once it is online. The public agenda shows a "Watch recording" button
					as soon as it is set; emptying the field takes it back down.
				</p>
				<form
					method="POST"
					action="?/recording"
					class="mt-3 space-y-2"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							try {
								await update();
							} finally {
								busy = false;
							}
						};
					}}
				>
					<input type="hidden" name="placementId" value={scheduled.id} />
					<Input
						name="recordingUrl"
						type="url"
						value={scheduled.recordingUrl ?? ''}
						placeholder="https://www.youtube.com/watch?v=…"
						aria-label="Recording link"
					/>
					<div class="flex items-center gap-3">
						<Button type="submit" size="sm" variant="outline" disabled={busy}>Save link</Button>
						{#if scheduled.recordingUrl}
							<a
								href={scheduled.recordingUrl}
								target="_blank"
								rel="noopener"
								class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
							>
								Open it
							</a>
						{/if}
					</div>
				</form>
			</section>
		{/if}
	</div>
</div>
