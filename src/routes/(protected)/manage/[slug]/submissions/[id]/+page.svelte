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
	import {
		describeDecision,
		describeNotification,
		notificationTone
	} from '$lib/conference/decision-summary';
	import { formatScore } from '$lib/conference/scoring';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const s = $derived(data.submission);

	let busy = $state(false);

	/**
	 * Open when the last save was refused, so a rejected edit is still on screen to
	 * correct rather than thrown away behind a closed panel.
	 *
	 * Reading `form` once, at mount, is the point and not an oversight: with JS the
	 * panel is already open when the refusal arrives, and without it the page mounts
	 * fresh with the errors in hand. A derived value would instead re-open the panel
	 * the moment Cancel closed it, since the failed `form` is still there.
	 */
	// svelte-ignore state_referenced_locally
	let editing = $state(!!form?.contentErrors);

	/**
	 * What the fields show: the rejected text after a refused save, the stored talk
	 * otherwise. Reading straight from `s` would answer "fix the title" by silently
	 * restoring the old one.
	 */
	const draft = $derived({
		title: form?.contentValues?.title ?? s.title,
		abstract: form?.contentValues?.abstract ?? s.abstract ?? '',
		keyTakeaway: form?.contentValues?.keyTakeaway ?? s.keyTakeaway ?? '',
		audienceLevel: form?.contentValues?.audienceLevel ?? s.audienceLevel ?? ''
	});

	const stamp = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleDateString('en-GB', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: null;

	/**
	 * A boolean answer is stored as the string the form's dropdown posted, so printing
	 * it raw puts "false" on the organizer's screen where the submitter chose "No".
	 */
	const answerValue = (answer: { kind: string; value: string | null }) => {
		if (answer.value === null || answer.value === '') return '—';
		if (answer.kind !== 'boolean') return answer.value;
		return answer.value === 'true' ? 'Yes' : 'No';
	};

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

	const decided = $derived(
		s.status === 'accepted' || s.status === 'rejected' || s.status === 'waitlisted'
	);
	const inTray = $derived(s.placements.length > 0);
	const notificationLabel = $derived(
		data.notificationStatus === 'queued'
			? 'Decision notification queued.'
			: data.notificationStatus === 'sent'
				? 'Decision notification sent.'
				: data.notificationStatus === 'failed'
					? 'Decision notification failed. Notify again to retry.'
					: decided
						? 'Decision saved. Speakers have not been notified.'
						: 'Choose a decision before notifying speakers.'
	);

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

	{#if form?.notificationResult}
		{@const tone = notificationTone(form.notificationResult)}
		<p
			class={tone === 'bad'
				? 'text-status-bad mt-3 text-sm'
				: tone === 'warn'
					? 'text-status-warn mt-3 text-sm'
					: 'text-status-good mt-3 text-sm'}
			role={tone === 'bad' ? 'alert' : 'status'}
		>
			{describeNotification(form.notificationResult)}
		</p>
	{:else if form?.result}
		<p class="text-status-good mt-3 text-sm" role="status">
			{describeDecision(form.decision, form.result)}
		</p>
	{:else if form?.message}
		<p class="text-status-bad mt-3 text-sm" role="alert">{form.message}</p>
	{/if}
</div>

<div class="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="space-y-4">
		<section class="border-border bg-card rounded-lg border p-5" data-testid="talk-content">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
					Abstract
				</h2>
				{#if !editing}
					<Button size="sm" variant="outline" onclick={() => (editing = true)}>Edit talk</Button>
				{/if}
			</div>

			{#if editing}
				<!--
					The speaker's own form is closed once the call closes or the talk is
					decided — which is exactly when a typo on the public programme is worth
					fixing. So the organizer gets the four content fields here, and every
					save leaves a revision behind saying who changed what.
				-->
				<form
					method="POST"
					action="?/content"
					class="mt-3 space-y-3"
					use:enhance={() => {
						busy = true;
						return async ({ update, result }) => {
							try {
								await update();
								if (result.type === 'success') editing = false;
							} finally {
								busy = false;
							}
						};
					}}
				>
					<div class="space-y-1">
						<Label for="talk-title">Title</Label>
						<Input id="talk-title" name="title" value={draft.title} required />
						{#if form?.contentErrors?.title}
							<p class="text-status-bad text-sm" role="alert">{form.contentErrors.title}</p>
						{/if}
					</div>
					<div class="space-y-1">
						<Label for="talk-abstract">Abstract</Label>
						<Textarea id="talk-abstract" name="abstract" rows={8} value={draft.abstract} />
						{#if form?.contentErrors?.abstract}
							<p class="text-status-bad text-sm" role="alert">{form.contentErrors.abstract}</p>
						{/if}
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<Label for="talk-takeaway">Key takeaway</Label>
							<Input id="talk-takeaway" name="keyTakeaway" value={draft.keyTakeaway} />
						</div>
						<div class="space-y-1">
							<Label for="talk-audience">Audience level</Label>
							<Input
								id="talk-audience"
								name="audienceLevel"
								value={draft.audienceLevel}
								placeholder="Beginner, intermediate, advanced"
							/>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<Button type="submit" size="sm" disabled={busy}>Save talk</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							disabled={busy}
							onclick={() => (editing = false)}
						>
							Cancel
						</Button>
						<span class="text-muted-foreground text-xs">
							The speaker is not notified of this change.
						</span>
					</div>
				</form>
			{:else}
				<p class="mt-2 leading-relaxed whitespace-pre-line">{s.abstract ?? 'No abstract.'}</p>
				{#if form?.contentSaved}
					<p class="text-status-good mt-2 text-sm" role="status">{form.contentSaved}</p>
				{:else if data.contentEdit}
					<p class="text-muted-foreground mt-2 text-xs" data-testid="content-edit-trail">
						Edited by {data.contentEdit.editorName ?? 'an organizer'} on
						{stamp(data.contentEdit.editedAt)}.
					</p>
				{/if}
			{/if}

			{#if !editing && (s.keyTakeaway || s.audienceLevel)}
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
							<dd>{answerValue(answer)}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>

		<section class="border-border bg-card rounded-lg border p-5" data-testid="submission-reviews">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Reviews</h2>
				<div class="flex flex-wrap items-center gap-3">
					<span class="font-medium tabular-nums">Ø {formatScore(s.score)}</span>
					<a
						class="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
						href="{base}/rounds"
						data-testid="edit-scorecard-link"
					>
						Scorecard &amp; weights
					</a>
				</div>
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

			<!--
			The organizer's own review, when they have one.

			Reviews are not written here and should not be: the reviewer form carries
			the round's criteria, the blind-mode rules and the recusal path, and a
			second copy of it on this screen would be a second implementation of
			#33's guarantees. What was missing was the door — an organizer assigned to
			their own conference had to remember that /review exists and navigate to
			it by hand.

			The line stays honest in the other direction too: when there is no door,
			it says what would open one instead of silently offering nothing.
		-->
			<div class="border-border mt-4 border-t pt-4" data-testid="own-review">
				{#if data.ownReview}
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-sm">
							{data.ownReview.status === 'submitted'
								? 'You have reviewed this submission.'
								: 'This submission is assigned to you for review.'}
						</p>
						<Button
							href="/review/{data.conference.slug}/{s.id}"
							variant={data.ownReview.status === 'submitted' ? 'outline' : 'default'}
							size="sm"
						>
							{data.ownReview.status === 'submitted' ? 'Open your review' : 'Write your review'}
						</Button>
					</div>
				{:else}
					<p class="text-muted-foreground text-sm">
						Reviews are written by the reviewers assigned below. To write one yourself, take a
						reviewer seat in
						<a class="underline underline-offset-4" href="{base}/people">Reviewer pool</a>
						<!--
							The second half names the step that is actually next: with no round
							yet, "assign yourself to a round" points at a control that is not
							there — and the block below already says so.
						-->
						{data.assignmentRounds.length === 0
							? 'and create a review round.'
							: 'and assign yourself to a round here.'}
					</p>
				{/if}
			</div>

			<div class="border-border mt-4 border-t pt-4" data-testid="review-assignments">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 class="text-sm font-semibold">Reviewer assignments</h3>
					<span class="text-muted-foreground text-xs">One reviewer at a time</span>
				</div>
				{#if form?.assignmentMessage}
					<p class="mt-2 text-sm" role="status">{form.assignmentMessage}</p>
				{/if}
				{#if data.assignmentRounds.length === 0}
					<p class="text-muted-foreground mt-2 text-sm">
						<a class="underline" href="/manage/{data.conference.slug}/rounds">
							Create a review round
						</a>
						before assigning submissions.
					</p>
				{:else}
					<div class="mt-3 space-y-4">
						{#each data.assignmentRounds as round (round.id)}
							<div>
								<h4 class="text-xs font-medium">{round.name}</h4>
								{#if round.reviewers.length === 0}
									<p class="text-muted-foreground mt-1 text-sm">
										No eligible reviewers in this round —
										<a class="underline" href="/manage/{data.conference.slug}/people">
											add someone to the committee
										</a>.
									</p>
								{:else}
									<ul class="mt-1 divide-y">
										{#each round.reviewers as reviewer (reviewer.userId)}
											<li class="flex items-center justify-between gap-3 py-2 text-sm">
												<div class="min-w-0">
													<p class="truncate font-medium">{reviewer.name}</p>
													<p class="text-muted-foreground truncate text-xs">{reviewer.email}</p>
												</div>
												<form method="POST" action="?/assignment">
													<input type="hidden" name="roundId" value={round.id} />
													<input type="hidden" name="reviewerUserId" value={reviewer.userId} />
													{#if reviewer.status === 'submitted'}
														<span class="text-muted-foreground text-xs">Submitted</span>
													{:else if reviewer.status && reviewer.status !== 'recused'}
														<Button
															type="submit"
															name="intent"
															value="unassign"
															variant="outline"
															size="sm"
														>
															Unassign · {reviewer.status}
														</Button>
													{:else}
														<Button
															type="submit"
															name="intent"
															value="assign"
															size="sm"
															disabled={!reviewer.eligible}
														>
															{reviewer.status === 'recused' ? 'Reassign' : 'Assign'}
														</Button>
													{/if}
												</form>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>

	<div class="space-y-4">
		<section class="border-border bg-card rounded-lg border p-4" data-testid="submission-speakers">
			<h2 class="text-sm font-medium">{s.speakers.length === 1 ? 'Speaker' : 'Speakers'}</h2>
			{#if s.speakers.length === 0}
				<p class="text-muted-foreground mt-2 text-sm">No speaker on this submission.</p>
			{:else}
				<ul class="mt-2 space-y-3">
					{#each s.speakers as speaker (speaker.id)}
						<li class="flex items-center gap-3" data-testid="speaker-row">
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
								<!--
									ABS-11: the CFP stores roleLabel on co-presenters, but job title /
									company used to win the single subtitle line and hide the role
									entirely whenever either was set. Role is its own line so it is
									always visible when the submitter gave one.
								-->
								{#if speaker.roleLabel}
									<div class="text-muted-foreground text-xs" data-testid="speaker-role">
										{speaker.roleLabel}
									</div>
								{:else if speaker.isPrimary}
									<div class="text-muted-foreground text-xs" data-testid="speaker-role">
										Primary speaker
									</div>
								{/if}
								{#if speaker.jobTitle || speaker.company}
									<div class="text-muted-foreground truncate text-xs">
										{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
									</div>
								{/if}
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

		<!-- Deciding changes the programme; notifying people is deliberately separate. -->
		<section class="border-border bg-card rounded-lg border p-4">
			<h2 class="text-sm font-medium">Decision workflow</h2>
			<p class="text-muted-foreground mt-1 text-xs">
				Saving Accept, Waitlist or Decline does not notify speakers. Check the programme first, then
				send the decision explicitly.
			</p>
			<h3 class="mt-3 text-xs font-medium">Accepting also</h3>
			<ul class="text-muted-foreground mt-2 space-y-1 text-sm">
				<li>· put the talk in the agenda tray as an unscheduled session</li>
				<li>· confirm the speakers for this conference</li>
				<li>· create their tasks from the conference's task template</li>
			</ul>
			<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
				Declining or waitlisting an accepted talk takes the session back out of the tray and
				withdraws the tasks nobody has started. A slot you already confirmed stays — that one is
				yours to move.
			</p>
			{#if inTray && (s.status === 'rejected' || s.status === 'waitlisted')}
				<p
					class="border-status-warn/40 bg-status-warn-bg text-status-warn mt-3 rounded-md border px-3 py-2 text-sm font-medium"
					data-testid="rejected-placement-badge"
					role="status"
				>
					{s.status === 'rejected' ? 'Declined' : 'Waitlisted'} but still on the programme ({s.placements
						.map((p) => p.status)
						.join(', ')}). Remove or reassign the slot on
					<a class="underline underline-offset-4" href="{base}/agenda">Agenda</a>.
				</p>
			{:else if inTray}
				<p class="text-muted-foreground border-border mt-3 border-t pt-3 text-xs">
					Already in the programme as
					{s.placements.map((p) => p.status).join(', ')}.
				</p>
			{/if}
			<div class="border-border mt-3 border-t pt-3">
				<p class="text-muted-foreground text-xs" data-testid="decision-notification-status">
					{notificationLabel}
				</p>
				<form
					method="POST"
					action="?/notify"
					class="mt-2"
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
					<Button type="submit" variant="secondary" size="sm" disabled={!decided || busy}>
						{data.notificationStatus === 'failed' ? 'Notify again' : 'Notify speakers of decision'}
					</Button>
				</form>
			</div>
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
