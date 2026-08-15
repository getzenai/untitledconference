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
	import { enhance } from '$lib/forms/enhance';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { ratingAnswerError } from '$lib/conference/rating-answer';
	import { formatScore } from '$lib/conference/scoring';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import SpeakerHistoryPanel from '$lib/components/app/conference/speaker-history.svelte';
	import StatusBadge from '$lib/components/status-badge.svelte';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import FilePreviewSheet from '$lib/components/file-preview-sheet.svelte';
	import AnswerText from '$lib/components/app/conference/answer-text.svelte';
	import ReviewerChat from '$lib/components/app/conference/reviewer-chat.svelte';
	import ReviewFileAnswer from '$lib/components/review-file-answer.svelte';
	import { filenameFrom, type FilePreviewKind } from '$lib/conference/file-preview';

	let { data, form } = $props();

	let preview = $state<{ title: string; src: string; kind: FilePreviewKind } | null>(null);

	const openFile = (value: string, kind: FilePreviewKind) => {
		preview = { title: filenameFrom(value), src: value, kind };
	};

	const s = $derived(data.submission);
	const withdrawn = $derived(s.status === 'withdrawn');
	// Two different reasons the form takes nothing, and they read differently: a
	// withdrawn talk is gone, a shut round comes back (ABS-01). Both disable the same
	// buttons, and `saveReview` refuses both regardless of what this page drew.
	const shut = $derived(s.window.state !== 'open');
	const locked = $derived(withdrawn || shut);
	let busy = $state(false);

	/**
	 * Recusing asks first (#463).
	 *
	 * Every other button in that row is reversible — a draft can be saved again, a
	 * submitted review can be edited. This one hands the talk back to the organizers
	 * and nothing in the reviewer's own screens can undo it; only an organizer can
	 * re-assign. It sits one careless click from "Save progress", so it gets the
	 * question the bulk-decide table already asks before it acts.
	 *
	 * The interception lives in `enhance`, not on the button, for the same reason the
	 * button stays live outside the round window: the server takes this POST whatever
	 * the page drew. A dialog is a courtesy to the reviewer, not a guard on the action
	 * — cancelling the submit is the whole mechanism, and the confirm click re-submits
	 * the same button so a browser without JS keeps the old one-click behaviour rather
	 * than losing the control.
	 */
	let reviewForm = $state<HTMLFormElement | null>(null);
	let confirmRecuseOpen = $state(false);
	let allowRecuse = false;

	/** The recuse button is the only submitter on this form named `reviewId`. */
	const isRecuse = (submitter: HTMLElement | null) =>
		submitter instanceof HTMLButtonElement && submitter.name === 'reviewId';

	const confirmRecuse = () => {
		const button = reviewForm?.querySelector<HTMLButtonElement>('button[name="reviewId"]');
		if (!button) return;
		allowRecuse = true;
		confirmRecuseOpen = false;
		reviewForm?.requestSubmit(button);
	};

	/**
	 * A thrown action must not replace this page (#482). Same wrapper as the
	 * proposal form: a 500 that lands on `+error.svelte` takes the written
	 * review with it. Recuse still cancels first — the wrapper only holds the
	 * page when a POST actually ran and threw.
	 */
	/**
	 * The scores as they currently read in the boxes (#477).
	 *
	 * Kept here rather than left to the browser because the browser's answer to a
	 * 7 on a 1–5 scale was a native bubble — its own font, its own wording, on a
	 * page that has both of its own — and because that bubble was doing more than
	 * it looked: a number past the scale is DROPPED on the way to the database,
	 * not clamped, so anybody who got past the bubble saved a blank criterion and
	 * was told their progress was saved. The form is `novalidate`; the rule is
	 * ours, and `saveReview` asks it again on the POST.
	 */
	let typed = $state<Record<number, string>>({});

	/** What the box reads now: what they typed, or what was stored before they did. */
	const scoreOf = (criterion: { id: number; value: number | null }) =>
		typed[criterion.id] ?? (criterion.value === null ? '' : String(criterion.value));

	const scoreErrors = $derived(
		new Map(
			s.criteria
				.filter((criterion) => criterion.kind === 'rating')
				.map((criterion) => [criterion.id, ratingAnswerError(scoreOf(criterion), criterion)])
				.filter((entry): entry is [number, string] => entry[1] !== null)
		)
	);

	const submitting: SubmitFunction = ({ submitter, cancel }) => {
		if (isRecuse(submitter) && !allowRecuse) {
			cancel();
			confirmRecuseOpen = true;
			return;
		}
		// Handing work back is not scoring, so a bad number does not stand in its
		// way; anything that writes the scorecard does wait for the number to make
		// sense. The message is already under the field — there is nothing a round
		// trip would add.
		if (!isRecuse(submitter) && scoreErrors.size > 0) {
			cancel();
			return;
		}
		// The confirm click re-submits the same button; that one goes through.
		allowRecuse = false;
		busy = true;
		return async ({ update }) => {
			try {
				await update(formUpdateOptions('edit'));
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

	const formOk = $derived(Boolean(form && 'ok' in form && form.ok));
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

	<!-- The round rides in the action as well as the body: after the POST the page
	     reloads on THIS url, and a bare `?/save` would drop the query and redraw the
	     other round's scorecard under the answers just filed. -->
	<form
		bind:this={reviewForm}
		method="POST"
		action="?/save&round={s.round.id}"
		novalidate
		use:enhance={submitting}
		class="border-border bg-card h-fit space-y-3 rounded-lg border p-4"
	>
		<!-- The round this form was drawn for (#294). Without it a reviewer who holds
		     the talk in two open rounds would post the second round's answers into
		     the first, which is the tie the permalink used to lose. -->
		<input type="hidden" name="roundId" value={s.round.id} />
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold">My review — {s.round.name}</h2>
			<StatusBadge
				status={withdrawn ? 'withdrawn' : s.own.status}
				label={withdrawn ? 'Withdrawn' : s.own.status === 'submitted' ? 'Reviewed' : 'To review'}
			/>
		</div>

		{#if shut}
			<!-- The answers stay readable for the same reason a withdrawn talk's do — a
			     review already filed is a record — but nothing here asks for more work. -->
			<p
				class="border-status-warn/40 bg-status-warn-bg text-status-warn rounded-md border px-3 py-2 text-sm"
				role="status"
				data-testid="round-window-notice"
			>
				{s.window.notice}
			</p>
		{/if}

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
				class="rounded-md border px-3 py-2 text-sm {formOk
					? 'border-status-good text-status-good'
					: 'border-status-bad text-status-bad'}"
				role={formOk ? 'status' : 'alert'}
			>
				{form.message}
			</p>
		{/if}

		{#if s.criteria.length === 0}
			<p class="text-muted-foreground text-sm">
				This round has no scorecard yet — leave your verdict as an overall comment.
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
					{@const scoreError = scoreErrors.get(criterion.id)}
					<input
						type="number"
						name="criterion-{criterion.id}"
						min="0"
						max={criterion.scaleMax ?? undefined}
						step="1"
						value={criterion.value ?? ''}
						oninput={(event) => (typed[criterion.id] = event.currentTarget.value)}
						disabled={locked}
						aria-invalid={scoreError ? 'true' : undefined}
						aria-describedby={scoreError ? `criterion-${criterion.id}-error` : undefined}
						class="{inputClass} mt-1 w-full {scoreError ? 'border-status-bad' : ''}"
						data-testid="criterion-{criterion.id}"
					/>
					{#if scoreError}
						<span
							id="criterion-{criterion.id}-error"
							class="text-status-bad mt-1 block text-xs"
							data-testid="criterion-error"
						>
							{scoreError}
						</span>
					{/if}
				{:else if criterion.kind === 'select'}
					<AppSelect
						name="criterion-{criterion.id}"
						class="mt-1"
						aria-label={criterion.label}
						placeholder="—"
						value={criterion.valueText ?? ''}
						disabled={locked}
						options={parseOptions(criterion.options).map((option) => ({
							value: option,
							label: option
						}))}
					/>
				{:else}
					<textarea
						name="criterion-{criterion.id}"
						rows="2"
						disabled={locked}
						class="{inputClass} mt-1 w-full">{criterion.valueText ?? ''}</textarea
					>
					<span class="text-muted-foreground mt-1 block text-xs">
						Part of this round's scorecard — not the overall comment below.
					</span>
				{/if}
			</label>
		{/each}

		<label class="block text-sm">
			<span class="text-muted-foreground text-xs">Overall comment</span>
			<textarea name="comment" rows="4" disabled={locked} class="{inputClass} mt-1 w-full"
				>{s.own.comment ?? ''}</textarea
			>
			<span class="text-muted-foreground mt-1 block text-xs">
				Your verdict on this talk. Visible to organizers and — unless the round is anonymised — to
				other reviewers.
			</span>
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
					disabled={busy || locked}
				>
					Update review
				</Button>
				<Button
					type="submit"
					name="intent"
					value="draft"
					variant="ghost"
					size="sm"
					disabled={busy || locked}
				>
					Save progress
				</Button>
			{:else}
				<Button type="submit" name="intent" value="submit" size="sm" disabled={busy || locked}>
					Submit review
				</Button>
				<Button
					type="submit"
					name="intent"
					value="draft"
					variant="outline"
					size="sm"
					disabled={busy || locked}
				>
					Save progress
				</Button>
			{/if}
			{#if s.own.status === 'assigned'}
				<!-- Still live outside the window, and deliberately: recusing files no
				     score, it hands work back, and `recuseReview` accepts it whatever the
				     round's dates say. A button disabled against a server that would take
				     the POST is the decoration ABS-01 is about. -->
				<Button
					type="submit"
					name="reviewId"
					value={s.own.reviewId}
					formaction="?/recuse"
					variant="ghost"
					size="sm"
					disabled={busy || withdrawn}
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

{#if data.chatEnabled}
	<ReviewerChat slug={data.conference.slug} focus={{ submissionId: s.id, title: s.title }} />
{/if}

<AlertDialog bind:open={confirmRecuseOpen}>
	<AlertDialogContent data-testid="recuse-dialog">
		<AlertDialogHeader>
			<AlertDialogTitle>Hand this talk back to the organizers?</AlertDialogTitle>
			<AlertDialogDescription>
				Your assignment for {s.round.name} is removed and the talk returns to the organizers. You will
				not be able to review it again unless they assign it to you.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel data-testid="recuse-cancel">Keep the assignment</AlertDialogCancel>
			<Button data-testid="recuse-confirm" onclick={confirmRecuse}>Recuse myself</Button>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
