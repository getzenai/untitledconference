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

	let { data } = $props();

	const s = $derived(data.submission);

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
		withdrawn: 'Withdrawn'
	};

	const stamp = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleString('en-GB', {
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: null;

	/**
	 * One string including its trailing space, rather than two template halves.
	 * Svelte trims the whitespace either side of `{/if}`, which is why this used to
	 * render "…at 04:57.A confirmation has gone…".
	 */
	const receivedLine = $derived(stamp(s.submittedAt) ? `Received ${stamp(s.submittedAt)}. ` : '');

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
				<a class="hover:underline" href="/c/{s.conferenceSlug}">{s.conferenceName}</a>
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
				You can still change it until the call closes — your place and the date above stay as they
				are.
			</p>
			<Button href="/portal/submissions/{s.id}/edit" size="sm" variant="outline" class="mt-3">
				Edit this proposal
			</Button>
		</div>
	{:else if s.status === 'draft'}
		<div class="border-border bg-muted/40 mt-6 rounded-lg border p-4 text-sm">
			<p class="font-medium">This is still a draft.</p>
			<p class="text-muted-foreground mt-1">
				Nobody has seen it yet. Pick it up where you left off, any time before the call closes.
			</p>
			<Button href="/portal/submissions/{s.id}/edit" size="sm" class="mt-3">
				Finish this proposal
			</Button>
		</div>
	{:else if s.status === 'accepted'}
		<div class="border-border bg-muted/40 mt-6 rounded-lg border p-4 text-sm">
			<p class="font-medium">Accepted.</p>
			<p class="text-muted-foreground mt-1">
				Anything else the organizers need from you appears under Your tasks in the speaker portal.
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
						<dd class="mt-0.5 whitespace-pre-line">{answerValue(answer)}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/if}
</div>
