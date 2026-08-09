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
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	const s = $derived(data.submission);

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
</script>

<svelte:head>
	<title>{s.title} — Speaker portal</title>
</svelte:head>

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
				{#if stamp(s.submittedAt)}Received {stamp(s.submittedAt)}.
				{/if}A confirmation has gone to everyone listed on the talk, and you will be emailed again
				when the organizers decide.
			</p>
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
				Anything the organizers need from you is on your <a class="underline" href="/portal"
					>portal</a
				>.
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
				<li>
					{speaker.name}{#if speaker.isPrimary}<span class="text-muted-foreground">
							— presenting</span
						>{:else if speaker.roleLabel}<span class="text-muted-foreground">
							— {speaker.roleLabel}</span
						>{/if}
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
						<dd class="mt-0.5 whitespace-pre-line">{answer.value}</dd>
					</div>
				{/each}
			</dl>
		</section>
	{/if}
</div>
