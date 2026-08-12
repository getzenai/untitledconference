<script lang="ts">
	/**
	 * The call as a submitter meets it: what is being asked, until when, and the
	 * form itself. The form is `ProposalForm`, the same component the portal's
	 * edit page renders, so finishing a draft never shows a different question set
	 * than starting one did.
	 */
	import { goto } from '$app/navigation';
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { consumePendingProposal, writePendingProposal } from '$lib/conference/pending-proposal';
	import { emptyProposal, type ProposalDraft } from '$lib/conference/proposal-draft';
	import { proseBlocks } from '$lib/conference/prose';
	import { formatDayLong, isoDay } from '$lib/conference/public-view';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	const call = $derived(data.call);
	const intro = $derived(proseBlocks(call.form.description));
	const signedIn = $derived(Boolean(data.user));
	const signInHref = $derived(`/login?returnTo=/c/${call.conference.slug}/cfp`);

	/**
	 * Filled in after hydrate so SSR and the first client render stay identical.
	 * A pending draft consumed here is the one "Sign in to submit" parked.
	 */
	let restored = $state<ProposalDraft | null>(null);

	onMount(() => {
		const draft = consumePendingProposal(sessionStorage, data.call.conference.slug);
		if (draft && !data.existing) restored = draft;
	});

	const resume = $derived(Boolean(signedIn && restored && !data.existing));

	function stashAndSignIn(draft: ProposalDraft) {
		writePendingProposal(sessionStorage, data.call.conference.slug, draft);
		void goto(signInHref);
	}

	const closesLabel = $derived(
		call.form.closesAt ? formatDayLong(isoDay(call.form.closesAt)) : null
	);
</script>

<svelte:head>
	<title>Call for papers — {call.conference.name}</title>
</svelte:head>

<div class="max-w-3xl">
	<h2 class="text-xl font-semibold tracking-tight">{call.form.title}</h2>

	<!--
		The deadline stays directly under the title, as in the prototype: it is the
		one thing someone reopens this page for, so it goes above the explanation
		rather than beneath it.
	-->
	{#if closesLabel && call.state === 'open'}
		<p class="text-muted-foreground mt-1 text-sm">Proposals close on {closesLabel}.</p>
	{/if}

	<!--
		What the organizer wants a submitter to know before starting (CFP-01). It
		sits above the form and above the sign-in note, because it is what decides
		whether someone fills the form in at all — and it is dropped once the call
		has closed, where "travel is covered" would be a promise about a call nobody
		can enter any more.
	-->
	{#if intro.length > 0 && call.state !== 'closed'}
		<div class="border-border bg-card mt-4 rounded-lg border p-6">
			{#each intro as block, i (i)}
				{#if block.kind === 'paragraph'}
					<p class="text-muted-foreground text-sm {i > 0 ? 'mt-3' : ''}">{block.text}</p>
				{:else}
					<ul class="text-muted-foreground space-y-1.5 text-sm {i > 0 ? 'mt-3' : ''}">
						{#each block.items as item, j (j)}
							<li class="flex gap-2"><span aria-hidden="true">·</span><span>{item}</span></li>
						{/each}
					</ul>
				{/if}
			{/each}
		</div>
	{/if}

	{#if call.state === 'closed'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has closed{closesLabel ? ` — proposals were accepted until ${closesLabel}` : ''}.
			Anything you already submitted is still in your
			<a class="underline" href="/portal">speaker portal</a>.
		</p>
	{:else if call.state === 'not_yet_open'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has not opened yet. Check back nearer the date.
		</p>
	{:else}
		{#if data.existing}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				{#if data.existing.status !== 'draft'}
					You already sent a proposal to this call —
					<a class="underline" href="/portal/submissions/{data.existing.id}/edit">
						{data.existing.title}
					</a>. Edit that one instead; filling this form in again would send a second.
				{:else}
					You already have an unfinished proposal here —
					<a class="underline" href="/portal/submissions/{data.existing.id}/edit">
						{data.existing.title}
					</a>. Filling this form in again would create a second one.
				{/if}
			</p>
		{/if}

		{#if !signedIn}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				You can read the whole form without an account. To submit — and to come back and edit it
				before the call closes — you will need to
				<a class="underline" href={signInHref}>sign in</a>.
			</p>
		{/if}

		{#if resume}
			<p
				class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm"
				data-testid="cfp-resume-after-signin"
				role="status"
			>
				{#if form?.errors || form?.fieldErrors}
					You are signed in — press Submit to finish.
				{:else}
					You are signed in — submitting the proposal you wrote.
				{/if}
			</p>
		{/if}

		{#key restored}
			<ProposalForm
				fields={call.fields}
				fixed={call.fixed}
				formats={call.formats}
				tracks={call.tracks}
				initial={restored ?? emptyProposal()}
				{form}
				{signedIn}
				{signInHref}
				onSignIn={stashAndSignIn}
				autoSubmit={resume}
			/>
		{/key}
	{/if}
</div>
