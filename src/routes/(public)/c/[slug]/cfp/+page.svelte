<script lang="ts">
	/**
	 * The call as a submitter meets it: what is being asked, until when, and the
	 * form itself. The form is `ProposalForm`, the same component the portal's
	 * edit page renders, so finishing a draft never shows a different question set
	 * than starting one did.
	 */
	import { goto } from '$app/navigation';
	import ProposalForm from '$lib/components/app/conference/proposal-form.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		clearAutosavedProposal,
		consumePendingProposal,
		isTypedProposal,
		readAutosavedProposal,
		writeAutosavedProposal,
		writePendingProposal
	} from '$lib/conference/pending-proposal';
	import { emptyProposal, type ProposalDraft } from '$lib/conference/proposal-draft';
	import CallProse from '$lib/components/app/conference/call-prose.svelte';
	import SpeakerSupportBlock from '$lib/components/app/conference/speaker-support-block.svelte';
	import { cfpDeadlinePath } from '$lib/conference/cfp-deadline';
	import { formatInstant } from '$lib/conference/deadline';
	import { proseBlocks } from '$lib/conference/prose';
	import { readerZone } from '$lib/conference/reader-zone.svelte';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	const call = $derived(data.call);
	const intro = $derived(proseBlocks(call.form.description));
	const signedIn = $derived(Boolean(data.user));
	const signInHref = $derived(`/login?returnTo=/c/${call.conference.slug}/cfp`);

	/**
	 * Filled in after hydrate so SSR and the first client render stay identical.
	 *
	 * Two sources, one field. The pending draft is the sign-in handoff and is
	 * consumed; the autosaved draft is the typed work and is only read. Mixing
	 * them would auto-submit an incomplete form the next time a signed-in
	 * speaker walked back in (#494).
	 */
	let restored = $state<ProposalDraft | null>(null);
	let restoredAt = $state<number | null>(null);
	let fromPending = $state(false);
	let pendingIntent = $state<'draft' | 'submit' | null>(null);
	let listening = $state(false);
	let startingAnother = $state(false);

	const existingDraft = $derived(data.existing?.status === 'draft' ? data.existing : null);
	const showNewProposal = $derived(!existingDraft || startingAnother);

	/**
	 * Whose parked draft this page may open (#505).
	 *
	 * A signed-in reader sees only what they typed themselves. The anonymous
	 * copy reaches an account through one door — the same-tab handoff below —
	 * and is swept the moment somebody signed in opens this call, because from
	 * then on nobody can adopt it and it is only a stranger's name, email and
	 * bio sitting in a browser that is plainly shared.
	 */
	const owner = $derived(data.user?.id ?? null);

	onMount(() => {
		const slug = data.call.conference.slug;
		const mine = data.user?.id ?? null;
		if (data.existing) {
			// A server copy is the truth. A leftover local one would come back
			// if this proposal were later withdrawn — and a leftover anonymous
			// one is somebody else's, on a browser two people share.
			clearAutosavedProposal(localStorage, slug, mine);
			if (mine) clearAutosavedProposal(localStorage, slug, null);
			listening = true;
			return;
		}
		// The server copy is written by the sign-up hook and survives the
		// verification link opening in a new tab (#643). Consume the same-tab copy
		// regardless, so the two handoff paths cannot become two future saves.
		const browserPending = consumePendingProposal(sessionStorage, slug);
		const pending = data.pendingProposal ?? browserPending;
		if (pending) {
			restored = pending.draft;
			pendingIntent = pending.intent;
			fromPending = true;
			// It has made its trip; the anonymous slot is not a second copy.
			clearAutosavedProposal(localStorage, slug, null);
		} else {
			if (mine) clearAutosavedProposal(localStorage, slug, null);
			const saved = readAutosavedProposal(localStorage, slug, mine);
			restored = saved?.draft ?? null;
			restoredAt = saved?.savedAt ?? null;
		}
		listening = true;
	});

	const resume = $derived(Boolean(signedIn && fromPending && restored && !data.existing));
	/** A restored local draft is worth saying out loud — see the banner below. */
	const resumedLocal = $derived(Boolean(restored && !fromPending && restoredAt !== null));

	/**
	 * A stored profile fills the About-you fields until a local draft takes over.
	 * The local copy is what they typed; claiming the profile wrote it would lie.
	 */
	const fromProfile = $derived(
		data.speakerProfile
			? { ...emptyProposal(), speaker: data.speakerProfile.speaker }
			: emptyProposal()
	);

	function persistDraft(draft: ProposalDraft) {
		const slug = data.call.conference.slug;
		if (data.existing) return;
		if (!isTypedProposal(draft)) {
			clearAutosavedProposal(localStorage, slug, owner);
			return;
		}
		writeAutosavedProposal(localStorage, slug, owner, draft);
	}

	function clearDraft() {
		clearAutosavedProposal(localStorage, data.call.conference.slug, owner);
	}

	/** "Not mine" — throw the parked copy away and start on an empty form. */
	function discardDraft() {
		clearDraft();
		restored = null;
		restoredAt = null;
	}

	function stashAndSignIn(draft: ProposalDraft, intent: 'draft' | 'submit') {
		writePendingProposal(sessionStorage, data.call.conference.slug, draft, intent);
		void goto(signInHref);
	}

	/**
	 * The deadline as a moment, not a day (#468).
	 *
	 * This page used to print the UTC *day* and drop the time, so a call closing
	 * at 23:59Z told a speaker "Monday 15 February" while the organizer's own
	 * screen said Feb 16, 00:59. Same instant, different day, no zone on either
	 * side. Now both read the same function, and the zone is part of the text.
	 */
	const zone = readerZone();
	const closesLabel = $derived(
		call.form.closesAt ? formatInstant(call.form.closesAt, zone.current) : null
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
		<p class="text-muted-foreground mt-1 text-sm">
			Proposals close {closesLabel}.
			<a
				class="underline underline-offset-2 hover:no-underline"
				href={cfpDeadlinePath(call.conference.slug)}
				download
				type="text/calendar"
				data-testid="cfp-deadline-calendar"
			>
				Add to calendar
			</a>
		</p>
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
			<CallProse blocks={intro} />
		</div>
	{/if}

	<!--
		The first question a speaker asks after reading what the call is about, and
		the one that must survive the call closing (#512): the description above is
		dropped then, this is not, so on a closed call this is the first block.
		Under the description rather than over it — the pitch comes before the money.
	-->
	<SpeakerSupportBlock support={call.support} />

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
		{#if existingDraft}
			<div
				class="border-border bg-card mt-4 rounded-lg border p-4"
				data-testid="cfp-existing-draft"
			>
				<h3 class="font-semibold">Continue your draft</h3>
				<p class="text-muted-foreground mt-1 text-sm">
					{existingDraft.title} is still private. Finish it before starting over.
				</p>
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<Button
						href="/portal/submissions/{existingDraft.id}/edit"
						variant={startingAnother ? 'outline' : 'act'}
						data-testid="cfp-continue-draft"
					>
						Continue draft
					</Button>
					{#if !startingAnother}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid="cfp-start-another"
							onclick={() => (startingAnother = true)}
						>
							Start another proposal
						</Button>
					{/if}
				</div>
			</div>
		{:else if data.existing}
			<p class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm">
				You already sent a proposal to this call —
				<a class="underline" href="/portal/submissions/{data.existing.id}/edit">
					{data.existing.title}
				</a>. Edit that one instead; filling this form in again would send a second.
			</p>
		{/if}

		{#if showNewProposal && !signedIn}
			<div
				class="border-border bg-card mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
				data-testid="cfp-sign-in"
			>
				<div class="min-w-0">
					<p class="text-sm font-medium">Sign in to submit — or to reuse a speaker profile.</p>
					<p class="text-muted-foreground mt-1 text-sm">
						If you have spoken for this organizer before, we will fill in your name, bio and the
						rest. You can still read the form first.
					</p>
				</div>
				<Button href={signInHref} variant="act">Sign in</Button>
			</div>
		{/if}

		{#if showNewProposal && data.speakerProfile}
			<!--
				The profile is org-wide (#558). A correction here is not "for this
				talk" — EMB-01 reads these columns on every talk this person gives
				the organizer. The sentence has to sit on the page before Submit,
				or the write is silent.
			-->
			<p
				class="border-border bg-card mt-4 rounded-lg border p-4 text-sm"
				data-testid="cfp-profile-source"
				role="status"
			>
				Name, bio and the rest are your speaker profile at {data.speakerProfile.organizationName}.
				Changing them here updates that profile for every talk you give this organizer — not just
				this proposal.
			</p>
		{/if}

		<!--
			Where the draft actually lives, and a way out of it (#505). The form
			coming up filled in is a good surprise only if the reader can tell
			whose typing it is: on a shared machine the honest answer is "this
			browser", and the useful control is throwing it away.
		-->
		{#if showNewProposal && resumedLocal}
			<div
				class="border-border bg-muted/40 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
				data-testid="cfp-resumed-local-draft"
			>
				<p class="text-muted-foreground">
					Continuing a draft saved in this browser on {formatInstant(
						new Date(restoredAt ?? 0),
						zone.current
					)}.
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="cfp-discard-draft"
					onclick={discardDraft}
				>
					Discard it
				</Button>
			</div>
		{/if}

		{#if showNewProposal && resume}
			<p
				class="border-border bg-muted/40 mt-4 rounded-lg border p-4 text-sm"
				data-testid="cfp-resume-after-signin"
				role="status"
			>
				{#if form?.errors || form?.fieldErrors}
					You are signed in — press {pendingIntent === 'draft' ? 'Save as draft' : 'Submit'} to finish.
				{:else if pendingIntent === 'draft'}
					You are signed in — saving the draft you wrote.
				{:else}
					You are signed in — submitting the proposal you wrote.
				{/if}
			</p>
		{/if}

		{#if showNewProposal}
			{#key restored}
				<ProposalForm
					fields={call.fields}
					fixed={call.fixed}
					formats={call.formats}
					tracks={call.tracks}
					initial={restored ?? fromProfile}
					{form}
					{signedIn}
					onSignIn={stashAndSignIn}
					autoAction={resume ? pendingIntent : null}
					onDraftChange={listening ? persistDraft : undefined}
					onCommitted={clearDraft}
				/>
			{/key}
		{/if}
	{/if}
</div>
