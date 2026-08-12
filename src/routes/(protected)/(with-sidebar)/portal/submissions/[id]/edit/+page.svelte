<script lang="ts">
	/**
	 * The proposal, reopened. Same form component as the public call — a returning
	 * submitter sees the questions they left, not a second version of them.
	 *
	 * Two states arrive here and they are not the same errand: an unfinished draft
	 * nobody has read, and a proposal already in front of the organizers. The
	 * second one must not offer "save as draft", which would quietly withdraw it.
	 */
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { formatDayLong, isoDay } from '$lib/conference/public-view';

	let { data, form } = $props();

	const call = $derived(data.call);
	const closesLabel = $derived(
		call.form.closesAt ? formatDayLong(isoDay(call.form.closesAt)) : null
	);
	const isDraft = $derived(data.status === 'draft');
</script>

<svelte:head>
	<title>{isDraft ? 'Finish' : 'Edit'} your proposal — {call.conference.name}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8">
	<a
		class="text-muted-foreground text-sm hover:underline"
		href="/portal/submissions/{data.submissionId}"
	>
		← Back to the proposal
	</a>

	<h1 class="mt-4 text-2xl font-semibold tracking-tight">
		{isDraft ? 'Finish your proposal' : 'Edit your proposal'}
	</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		{call.conference.name}{#if closesLabel}<span class="px-1.5">·</span>closes {closesLabel}{/if}
	</p>

	<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
		{#if isDraft}
			This is still a draft — nobody has seen it. <strong>Submit proposal</strong> hands it to the
			organizers; <strong>Save as draft</strong> keeps it here.
		{:else}
			This proposal is already with the organizers. <strong>Save changes</strong> updates what they read;
			it stays in their list, and the date it arrived does not change.
		{/if}
	</p>

	<ProposalForm
		fields={call.fields}
		fixed={call.fixed}
		formats={call.formats}
		tracks={call.tracks}
		initial={data.draft}
		{form}
		signedIn={true}
		submitLabel={isDraft ? 'Submit proposal' : 'Save changes'}
		allowDraft={isDraft}
	/>
</div>
