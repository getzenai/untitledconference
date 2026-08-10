<script lang="ts">
	/**
	 * The draft, reopened. Same form component as the public call — a returning
	 * submitter sees the questions they left, not a second version of them.
	 */
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { formatDayLong, isoDay } from '$lib/conference/public-view';

	let { data, form } = $props();

	const call = $derived(data.call);
	const closesLabel = $derived(
		call.form.closesAt ? formatDayLong(isoDay(call.form.closesAt)) : null
	);
</script>

<svelte:head>
	<title>Finish your proposal — {call.conference.name}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8">
	<a
		class="text-muted-foreground text-sm hover:underline"
		href="/portal/submissions/{data.submissionId}"
	>
		← Back to the proposal
	</a>

	<h1 class="mt-4 text-2xl font-semibold tracking-tight">Finish your proposal</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		{call.conference.name}{#if closesLabel}<span class="px-1.5">·</span>closes {closesLabel}{/if}
	</p>

	<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
		This is still a draft — nobody has seen it. <strong>Submit proposal</strong> hands it to the
		organizers; <strong>Save as draft</strong> keeps it here.
	</p>

	<ProposalForm
		fields={call.fields}
		formats={call.formats}
		tracks={call.tracks}
		initial={data.draft}
		{form}
		signedIn={true}
		signInHref="/login"
	/>
</div>
