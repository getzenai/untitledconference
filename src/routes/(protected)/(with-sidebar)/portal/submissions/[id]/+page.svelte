<script lang="ts">
	/**
	 * One proposal, as its author sees it — and the confirmation a submitter lands
	 * on (CFP-08).
	 *
	 * The banner is driven by the submission's status, not by a query parameter, so
	 * a reload or a bookmark shows the same truthful page rather than a stale
	 * "thanks!". What it promises is only what the system actually did: the receipt
	 * is in the send log, and the decision mail is what comes next.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import FeatherConfetti from '$lib/components/feather-confetti.svelte';
	import AnswerText from '$lib/components/app/conference/answer-text.svelte';
	import SpeakerSupportBlock from '$lib/components/app/conference/speaker-support-block.svelte';
	import { publicSiteLink } from '$lib/conference/conference-status';
	import { formatInstant } from '$lib/conference/deadline';
	import { readerZone } from '$lib/conference/reader-zone.svelte';

	let { data } = $props();

	const s = $derived(data.submission);
	const zone = readerZone();
	const site = $derived(publicSiteLink(s.conferenceStatus, s.conferenceSlug));

	// Goose easter egg: `justSubmitted` is a one-shot signal from the submit
	// action's redirect, not page truth — the banner below still reads off
	// `s.status`. Strip it on mount so a reload or bookmark doesn't re-fire it.
	let confettiTrigger = $state(0);
	onMount(() => {
		if (page.url.searchParams.get('justSubmitted') === '1') {
			confettiTrigger++;
			const url = new URL(page.url);
			url.searchParams.delete('justSubmitted');
			goto(url, { replaceState: true, noScroll: true, keepFocus: true });
		}
	});

	const statusLabel: Record<string, string> = {
		draft: 'Draft — not submitted',
		submitted: 'Submitted',
		in_review: 'In review',
		accepted: 'Accepted',
		rejected: 'Not accepted',
		waitlisted: 'Waitlisted',
		resubmit_with_guidance: 'Please resubmit',
		withdrawn: 'Withdrawn'
	};

	/**
	 * One string including its trailing space, rather than two template halves.
	 * Svelte trims the whitespace either side of `{/if}`, which is why this used to
	 * render "…at 04:57.A confirmation has gone…". The stamp names the zone (#498)
	 * so "20:29" is not a local time nobody specified.
	 */
	const receivedLine = $derived(
		s.submittedAt && formatInstant(s.submittedAt, zone.current)
			? `Received ${formatInstant(s.submittedAt, zone.current)}. `
			: ''
	);
	const closesLabel = $derived(
		data.closesAt ? formatInstant(data.closesAt, zone.current) || null : null
	);
	const callOpen = $derived(data.callState === 'open');
	const editClosedReason = $derived(
		data.callState === 'not_yet_open'
			? 'The call is not open yet.'
			: data.closedByOrganizer
				? 'The organizers have closed this call.'
				: 'This call has closed.'
	);
	const draftCloseLine = $derived(
		!callOpen
			? `Nobody has seen it yet. ${editClosedReason}`
			: closesLabel
				? `Nobody has seen it yet. Pick it up where you left off, any time before ${closesLabel}.`
				: 'Nobody has seen it yet. Pick it up where you left off, any time before the call closes.'
	);

	const answerValue = (answer: { kind: string; value: string | null }) => {
		if (answer.value === null || answer.value === '') return '—';
		if (answer.kind !== 'boolean') return answer.value;
		return answer.value === 'true' ? 'Yes' : 'No';
	};
</script>

<svelte:head>
	<title>{s.title} — Speaker portal</title>
</svelte:head>

<FeatherConfetti trigger={confettiTrigger} />

<div class="mx-auto max-w-3xl px-6 py-8">
	<a class="text-muted-foreground text-sm hover:underline" href="/portal">← Speaker portal</a>

	<div class="mt-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{s.title}</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if site.available}
					<a class="hover:underline" href={site.href}>{s.conferenceName}</a>
				{:else}
					{s.conferenceName}
				{/if}
			</p>
		</div>
		<Badge variant={s.status === 'draft' ? 'outline' : 'secondary'}>
			{statusLabel[s.status] ?? s.status}
		</Badge>
	</div>

	{#if s.status === 'submitted' || s.status === 'in_review'}
		<div class="border-border bg-muted/40 mt-6 rounded-lg border p-4 text-sm">
			<p class="font-medium">Your proposal is in.</p>
			<p class="text-muted-foreground mt-1">
				{receivedLine}A confirmation has gone to everyone listed on the talk, and you will be
				emailed again when the organizers decide.
			</p>
			<p class="text-muted-foreground mt-2">
				{#if callOpen}
					You can still change it until {closesLabel ?? 'the call closes'} — your place and the date above
					stay as they are.
				{:else}
					{editClosedReason} The text stays as it is.
				{/if}
			</p>
			{#if callOpen}
				<Button href="/portal/submissions/{s.id}/edit" size="sm" variant="outline" class="mt-3">
					Edit this proposal
				</Button>
			{:else}
				<Button size="sm" variant="outline" class="mt-3" disabled data-testid="edit-closed">
					Editing closed
				</Button>
			{/if}
		</div>
	{:else if s.status === 'draft'}
		<div class="border-border bg-muted/40 mt-6 rounded-lg border p-4 text-sm">
			<p class="font-medium">This is still a draft.</p>
			<p class="text-muted-foreground mt-1">{draftCloseLine}</p>
			{#if callOpen}
				<Button href="/portal/submissions/{s.id}/edit" size="sm" class="mt-3">
					Finish this proposal
				</Button>
			{:else}
				<Button size="sm" class="mt-3" disabled data-testid="edit-closed">Editing closed</Button>
			{/if}
		</div>
	{:else if s.status === 'accepted'}
		<div class="border-border bg-muted/40 mt-6 rounded-lg border p-4 text-sm">
			<p class="font-medium">Accepted.</p>
			<p class="text-muted-foreground mt-1">
				Anything else the organizers need from you appears under Your tasks in the speaker portal.
			</p>
			<!--
				Acceptance is the moment the speaker cares most about the words — they are
				about to be printed on the programme. The Edit button used to vanish
				without a sentence, which reads as a bug (#496). It stays, disabled, with
				the reason beside it, because "you may not" is an answer and silence is not.
			-->
			<p class="text-muted-foreground mt-3">
				The text is now fixed: the organizers accepted these words, and the programme is built from
				them. If the title or the abstract needs to change, ask the organizers.
			</p>
			<Button size="sm" variant="outline" class="mt-3" disabled data-testid="edit-closed">
				Editing closed
			</Button>
		</div>
	{:else if s.status === 'rejected'}
		<div class="border-status-bad/40 bg-muted/40 mt-6 rounded-lg border p-4 text-sm" role="status">
			<p class="font-medium">Not accepted.</p>
			<p class="text-muted-foreground mt-1">
				The organizers decided not to include this proposal in the programme.
			</p>
			{#if s.declineNote}
				<p class="mt-2" data-testid="portal-decline-note">{s.declineNote}</p>
			{/if}
		</div>
	{:else if s.status === 'resubmit_with_guidance'}
		<div class="border-status-warn/40 bg-muted/40 mt-6 rounded-lg border p-4 text-sm" role="status">
			<p class="font-medium">Please resubmit.</p>
			{#if s.resubmitGuidance}
				<p class="mt-1" data-testid="portal-guidance">{s.resubmitGuidance}</p>
			{/if}
		</div>
	{:else if s.status === 'waitlisted'}
		<div class="border-status-warn/40 bg-muted/40 mt-6 rounded-lg border p-4 text-sm" role="status">
			<p class="font-medium">Waitlisted.</p>
			<p class="text-muted-foreground mt-1">
				This proposal is on the reserve list. You will hear if a place opens up.
			</p>
		</div>
	{/if}

	<dl class="mt-8 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
		{#if s.formatName}
			<div>
				<dt class="text-muted-foreground text-xs">Session format</dt>
				<dd class="mt-0.5">{s.formatName}</dd>
			</div>
		{/if}
		{#if s.trackName}
			<div>
				<dt class="text-muted-foreground text-xs">Track</dt>
				<dd class="mt-0.5">{s.trackName}</dd>
			</div>
		{/if}
		{#if s.audienceLevel}
			<div>
				<dt class="text-muted-foreground text-xs">Audience level</dt>
				<dd class="mt-0.5">{s.audienceLevel}</dd>
			</div>
		{/if}
	</dl>

	{#if s.abstract}
		<section class="mt-8">
			<h2 class="text-sm font-medium">Abstract</h2>
			<p class="mt-2 text-sm whitespace-pre-line">{s.abstract}</p>
		</section>
	{/if}

	{#if s.keyTakeaway}
		<section class="mt-6">
			<h2 class="text-sm font-medium">Key takeaway</h2>
			<p class="mt-2 text-sm whitespace-pre-line">{s.keyTakeaway}</p>
		</section>
	{/if}

	{#if s.status === 'accepted'}
		<!--
			Same statement as the public call, under the talk text (#591). Still
			here after the call has closed (#512): the CFP description is gone
			by then; this is not.
		-->
		<SpeakerSupportBlock support={data.support} />
	{/if}

	<section class="mt-8">
		<h2 class="text-sm font-medium">
			{s.speakers.length === 1 ? 'Speaker' : 'Speakers'}
		</h2>
		<ul class="mt-2 space-y-1 text-sm">
			{#each s.speakers as speaker, i (i)}
				<li class="text-muted-foreground">
					<span class="text-foreground">{speaker.name}</span>{speaker.isPrimary
						? ' — presenting'
						: speaker.roleLabel
							? ` — ${speaker.roleLabel}`
							: ''}
				</li>
			{/each}
		</ul>
	</section>

	{#if s.answers.length > 0}
		<section class="mt-8">
			<h2 class="text-sm font-medium">Your answers</h2>
			<dl class="mt-2 space-y-3 text-sm">
				{#each s.answers as answer, i (i)}
					<div>
						<dt class="text-muted-foreground text-xs">{answer.label}</dt>
						<dd class="mt-0.5">
							{#if answer.kind === 'boolean' || answer.value === null || answer.value === ''}
								<span class="whitespace-pre-line">{answerValue(answer)}</span>
							{:else}
								<!-- #477: the same answer, the same links, on the submitter's own copy. -->
								<AnswerText value={answer.value} />
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/if}
</div>
