<script lang="ts">
	/**
	 * The call as a submitter meets it: what is being asked, until when, and the
	 * form itself. The form is `ProposalForm`, the same component the portal's
	 * edit page renders, so finishing a draft never shows a different question set
	 * than starting one did.
	 */
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { emptyProposal } from '$lib/conference/proposal-draft';
	import { formatDayLong, isoDay } from '$lib/conference/public-view';

	let { data, form } = $props();

	const call = $derived(data.call);
	const signedIn = $derived(Boolean(data.user));
	const signInHref = $derived(`/login?returnTo=/c/${call.conference.slug}/cfp`);

	const closesLabel = $derived(
		call.form.closesAt ? formatDayLong(isoDay(call.form.closesAt)) : null
	);
</script>

<svelte:head>
	<title>Call for papers — {call.conference.name}</title>
</svelte:head>

<div class="max-w-3xl">
	<h2 class="text-xl font-semibold tracking-tight">{call.form.title}</h2>

	{#if call.state === 'closed'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has closed{#if closesLabel}
				— proposals were accepted until {closesLabel}{/if}. Anything you already submitted is still
			in your <a class="underline" href="/portal">speaker portal</a>.
		</p>
	{:else if call.state === 'not_yet_open'}
		<p class="border-border bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-4 text-sm">
			This call has not opened yet. Check back nearer the date.
		</p>
	{:else}
		{#if closesLabel}
			<p class="text-muted-foreground mt-1 text-sm">Proposals close on {closesLabel}.</p>
		{/if}

		{#if data.existingDraft}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				You already have an unfinished proposal here —
				<a class="underline" href="/portal/submissions/{data.existingDraft.id}/edit">
					{data.existingDraft.title}
				</a>. Filling this form in again would create a second one.
			</p>
		{/if}

		{#if !signedIn}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				You can read the whole form without an account. To submit — and to come back and edit it
				before the call closes — you will need to
				<a class="underline" href={signInHref}>sign in</a>.
			</p>
		{/if}

		<ProposalForm
			fields={call.fields}
			formats={call.formats}
			tracks={call.tracks}
			initial={emptyProposal()}
			{form}
			{signedIn}
			{signInHref}
		/>
	{/if}
</div>
