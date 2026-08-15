<script lang="ts">
	/**
	 * The proposal, reopened. Same form component as the public call — a returning
	 * submitter sees the questions they left, not a second version of them.
	 *
	 * Two states arrive here and they are not the same errand: an unfinished draft
	 * that has not been submitted, and a proposal already in front of the organizers.
	 * The second one must not offer "save as draft", which would quietly withdraw it.
	 */
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { formatInstant } from '$lib/conference/deadline';
	import { readerZone } from '$lib/conference/reader-zone.svelte';

	let { data, form } = $props();

	const call = $derived(data.call);
	/**
	 * The moment the edit window shuts, in the reader's zone (#468).
	 *
	 * This line is the last thing a submitter reads before typing, and it used to
	 * name the UTC *day* with no time at all — so a call closing 23:59Z said
	 * "closes Monday 15 February" to someone in Berlin whose window in fact ended
	 * at 00:59 on the 16th. Same function and same shape as the public call page.
	 */
	const zone = readerZone();
	const closesLabel = $derived(
		call.form.closesAt ? formatInstant(call.form.closesAt, zone.current) : null
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
			This is still a draft — it has not been submitted. Reviewers will not see it until you submit.
			<strong>Submit proposal</strong> hands it to the organizers;
			<strong>Save as draft</strong> keeps it here.
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
