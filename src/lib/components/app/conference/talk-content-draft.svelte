<script lang="ts">
	/**
	 * The four organizer talk-edit fields. Typed values live in browser-draft
	 * until Save talk succeeds — a rail click or a refused save must not throw
	 * them away (#760).
	 */
	import { onMount } from 'svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { BROWSER_DRAFT_LEAVE_PROMPT } from '$lib/conference/browser-draft-copy';
	import { TALK_TITLE_MAX } from '$lib/conference/proposal-limits';
	import {
		parkableTalkContent,
		parseTalkContentDraft,
		sameTalkContent,
		talkContentBaseline,
		talkContentDraftScope,
		type TalkContentDraft
	} from '$lib/conference/talk-content-draft';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

	let {
		slug,
		submissionId,
		owner,
		status,
		saved,
		refused,
		errors
	}: {
		slug: string;
		submissionId: number;
		owner: string;
		status: string;
		saved: TalkContentDraft;
		refused?: TalkContentDraft | null;
		errors?: Record<string, string> | null;
	} = $props();

	// The panel remounts when Edit talk opens. Re-seeding from props on every
	// parent invalidation would overwrite the rewrite still in the fields.
	// svelte-ignore state_referenced_locally
	const scope = talkContentDraftScope(slug, submissionId);
	// svelte-ignore state_referenced_locally
	const baseline = talkContentBaseline(saved);
	// svelte-ignore state_referenced_locally
	const seed = refused ?? saved;

	let title = $state(seed.title);
	let abstract = $state(seed.abstract);
	let keyTakeaway = $state(seed.keyTakeaway);
	let audienceLevel = $state(seed.audienceLevel);
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<TalkContentDraft> | null>(null);

	const current = (): TalkContentDraft => ({ title, abstract, keyTakeaway, audienceLevel });

	const dirty = $derived(!conflict && !sameTalkContent(current(), saved));

	function apply(draft: TalkContentDraft): void {
		title = draft.title;
		abstract = draft.abstract;
		keyTakeaway = draft.keyTakeaway;
		audienceLevel = draft.audienceLevel;
	}

	function syncDraft(): void {
		if (!mounted || conflict) return;
		const parked = parkableTalkContent(current(), saved, status);
		if (sameTalkContent(parked, saved)) {
			clearBrowserDraft(localStorage, scope, owner);
			if (sameTalkContent(current(), saved)) restored = false;
			return;
		}
		writeBrowserDraft(localStorage, { scope, owner, baseline, value: parked });
	}

	function useSavedDraft(): void {
		if (!conflict) return;
		apply(parkableTalkContent(conflict.value, saved, status));
		conflict = null;
		restored = true;
		syncDraft();
	}

	function discardSavedDraft(): void {
		conflict = null;
		clearBrowserDraft(localStorage, scope, owner);
	}

	onMount(() => {
		const result = readBrowserDraft(localStorage, {
			scope,
			owner,
			baseline,
			parse: parseTalkContentDraft
		});
		if (result.status === 'current') {
			apply(parkableTalkContent(result.draft.value, saved, status));
			restored = true;
		} else if (result.status === 'conflict') {
			const parked = parkableTalkContent(result.draft.value, saved, status);
			if (sameTalkContent(parked, saved)) {
				clearBrowserDraft(localStorage, scope, owner);
			} else {
				conflict = result.draft;
			}
		}
		mounted = true;
		syncDraft();
	});
</script>

<UnsavedGuard {dirty} message={BROWSER_DRAFT_LEAVE_PROMPT} />

{#if restored}
	<p class="text-status-good text-sm" role="status" data-testid="talk-content-restored">
		Recovered your unsaved talk.
	</p>
{/if}

{#if conflict}
	<div
		class="border-status-warn bg-status-warn/10 rounded-md border p-2 text-sm"
		data-testid="talk-content-conflict"
	>
		<p>The saved talk changed after this draft was written.</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="underline" onclick={useSavedDraft}>Use my draft</button>
			<button type="button" class="underline" onclick={discardSavedDraft}
				>Keep the saved talk</button
			>
		</div>
	</div>
{/if}

<div class="space-y-1">
	<Label for="talk-title">Title</Label>
	<Input
		id="talk-title"
		name="title"
		required
		maxlength={TALK_TITLE_MAX}
		data-testid="talk-title"
		bind:value={title}
		oninput={syncDraft}
	/>
	{#if errors?.title}
		<p class="text-status-bad text-sm" role="alert">{errors.title}</p>
	{/if}
</div>
<div class="space-y-1">
	<Label for="talk-abstract">Abstract</Label>
	<Textarea
		id="talk-abstract"
		name="abstract"
		rows={8}
		data-testid="talk-abstract"
		bind:value={abstract}
		oninput={syncDraft}
	/>
	{#if errors?.abstract}
		<p class="text-status-bad text-sm" role="alert">{errors.abstract}</p>
	{/if}
</div>
<div class="grid gap-3 sm:grid-cols-2">
	<div class="space-y-1">
		<Label for="talk-takeaway">Key takeaway</Label>
		<Input
			id="talk-takeaway"
			name="keyTakeaway"
			data-testid="talk-takeaway"
			bind:value={keyTakeaway}
			oninput={syncDraft}
		/>
	</div>
	<div class="space-y-1">
		<Label for="talk-audience">Audience level</Label>
		<Input
			id="talk-audience"
			name="audienceLevel"
			data-testid="talk-audience"
			placeholder="Beginner, intermediate, advanced"
			bind:value={audienceLevel}
			oninput={syncDraft}
		/>
	</div>
</div>
