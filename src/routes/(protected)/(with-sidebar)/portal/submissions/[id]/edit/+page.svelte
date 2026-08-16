<script lang="ts">
	/**
	 * The proposal, reopened. Same form component as the public call — a returning
	 * submitter sees the questions they left, not a second version of them.
	 *
	 * Two states arrive here and they are not the same errand: an unfinished draft
	 * that has not been submitted, and a proposal already in front of the organizers.
	 * The second one must not offer "save as draft", which would quietly withdraw it.
	 *
	 * Typed values live in browser-draft until Save or Submit lands (#747). The
	 * page's own Back link, the sidebar, and the browser's back button all go
	 * through the same guard; the parked copy is why "leave" does not mean "lose".
	 */
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import { browserDraftLeavePrompt } from '$lib/conference/browser-draft-copy';
	import { formatInstant } from '$lib/conference/deadline';
	import {
		parsePortalProposalDraft,
		portalProposalBaseline,
		portalProposalDraftScope,
		sameProposalDraft
	} from '$lib/conference/portal-proposal-draft';
	import type { ProposalDraft } from '$lib/conference/proposal-draft';
	import { readerZone } from '$lib/conference/reader-zone.svelte';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

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
	const scope = $derived(portalProposalDraftScope(data.submissionId));
	const baseline = $derived(portalProposalBaseline(data.draft));

	let restored = $state<ProposalDraft | null>(null);
	let listening = $state(false);
	let dirty = $state(false);
	let conflict = $state<BrowserDraft<ProposalDraft> | null>(null);

	const initial = $derived(restored ?? data.draft);

	const persistDraft = (draft: ProposalDraft) => {
		if (!listening || !browser || conflict) return;
		if (sameProposalDraft(draft, data.draft)) {
			clearBrowserDraft(localStorage, scope, data.ownerId);
			dirty = false;
			return;
		}
		writeBrowserDraft(localStorage, {
			scope,
			owner: data.ownerId,
			baseline,
			value: draft
		});
		dirty = true;
	};

	const forgetDraft = () => {
		if (!browser) return;
		clearBrowserDraft(localStorage, scope, data.ownerId);
		dirty = false;
		restored = null;
		conflict = null;
	};

	const useBrowserDraft = () => {
		if (!conflict) return;
		restored = conflict.value;
		conflict = null;
		dirty = true;
		persistDraft(restored);
	};

	const keepSavedDraft = () => {
		forgetDraft();
	};

	onMount(async () => {
		if (!browser) return;
		const saved = readBrowserDraft(localStorage, {
			scope,
			owner: data.ownerId,
			baseline,
			parse: parsePortalProposalDraft
		});
		if (saved.status === 'current') {
			restored = saved.draft.value;
			dirty = !sameProposalDraft(saved.draft.value, data.draft);
		} else if (saved.status === 'conflict') {
			if (sameProposalDraft(saved.draft.value, data.draft)) {
				clearBrowserDraft(localStorage, scope, data.ownerId);
			} else {
				conflict = saved.draft;
			}
		}
		// Wait for `{#key}` to remount the form so the first paint cannot wipe
		// the parked copy by persisting the server draft.
		await tick();
		listening = true;
	});
</script>

<svelte:head>
	<title>{isDraft ? 'Finish' : 'Edit'} your proposal — {call.conference.name}</title>
</svelte:head>

<UnsavedGuard dirty={dirty && !conflict} message={browserDraftLeavePrompt('your proposal edit')} />

<div class="mx-auto max-w-3xl px-6 py-8">
	<a
		class="text-muted-foreground text-sm hover:underline"
		href="/portal/submissions/{data.submissionId}"
		data-testid="portal-edit-back"
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

	{#if restored}
		<p class="text-status-good mt-4 text-sm" role="status" data-testid="portal-edit-restored">
			Recovered your unsaved proposal.
		</p>
	{/if}

	{#if conflict}
		<div
			class="border-status-warn bg-status-warn/10 mt-4 rounded-md border p-3 text-sm"
			data-testid="portal-edit-conflict"
		>
			<p>The saved proposal changed after this draft was written.</p>
			<div class="mt-2 flex gap-2">
				<button type="button" class="underline" onclick={useBrowserDraft}>Use my draft</button>
				<button type="button" class="underline" onclick={keepSavedDraft}
					>Keep the saved proposal</button
				>
			</div>
		</div>
	{/if}

	{#key restored}
		<ProposalForm
			fields={call.fields}
			fixed={call.fixed}
			formats={call.formats}
			tracks={call.tracks}
			{initial}
			{form}
			signedIn={true}
			submitLabel={isDraft ? 'Submit proposal' : 'Save changes'}
			allowDraft={isDraft}
			onDraftChange={listening ? persistDraft : undefined}
			onCommitted={forgetDraft}
		/>
	{/key}
</div>
