<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

	type DecisionDraft = {
		condition: string;
		conditionOwnerId: string;
		guidance: string;
		declineNote: string;
	};

	let {
		submissionId,
		status,
		owner,
		baseline,
		ownerOptions,
		commitToken,
		ondirtychange
	}: {
		submissionId: number;
		status: string;
		owner: string;
		baseline: string;
		ownerOptions: { value: string; label: string }[];
		commitToken: number;
		ondirtychange: (submissionId: number, dirty: boolean) => void;
	} = $props();

	let condition = $state('');
	let conditionOwnerId = $state('');
	let guidance = $state('');
	let declineNote = $state('');
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<DecisionDraft> | null>(null);
	let handledCommit = 0;

	const scope = $derived(`decision:${page.url.pathname}:${submissionId}`);

	const snapshot = (): DecisionDraft => ({
		condition,
		conditionOwnerId,
		guidance,
		declineNote
	});

	const hasWork = (draft: DecisionDraft) => Object.values(draft).some((value) => value.length > 0);

	function parseDraft(value: unknown): DecisionDraft | null {
		if (!value || typeof value !== 'object') return null;
		const draft = value as Record<string, unknown>;
		if (
			typeof draft.condition !== 'string' ||
			typeof draft.conditionOwnerId !== 'string' ||
			typeof draft.guidance !== 'string' ||
			typeof draft.declineNote !== 'string'
		) {
			return null;
		}
		return {
			condition: draft.condition,
			conditionOwnerId: draft.conditionOwnerId,
			guidance: draft.guidance,
			declineNote: draft.declineNote
		};
	}

	function applyDraft(draft: DecisionDraft): void {
		condition = draft.condition;
		conditionOwnerId = draft.conditionOwnerId;
		guidance = draft.guidance;
		declineNote = draft.declineNote;
	}

	function syncDraft(): void {
		if (!mounted || conflict) return;
		const value = snapshot();
		const dirty = hasWork(value);
		if (dirty) {
			writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		} else {
			clearBrowserDraft(localStorage, scope, owner);
		}
		ondirtychange(submissionId, dirty);
	}

	function useSavedDraft(): void {
		if (!conflict) return;
		applyDraft(conflict.value);
		conflict = null;
		restored = true;
		syncDraft();
	}

	function discardSavedDraft(): void {
		conflict = null;
		clearBrowserDraft(localStorage, scope, owner);
		ondirtychange(submissionId, false);
	}

	function clearCommittedDraft(): void {
		applyDraft({ condition: '', conditionOwnerId: '', guidance: '', declineNote: '' });
		conflict = null;
		restored = false;
		clearBrowserDraft(localStorage, scope, owner);
		ondirtychange(submissionId, false);
	}

	onMount(() => {
		const result = readBrowserDraft(localStorage, { scope, owner, baseline, parse: parseDraft });
		if (result.status === 'current') {
			applyDraft(result.draft.value);
			restored = true;
		} else if (result.status === 'conflict') {
			conflict = result.draft;
			ondirtychange(submissionId, true);
		}
		mounted = true;
		syncDraft();
	});

	$effect(() => {
		if (!mounted || commitToken <= handledCommit) return;
		handledCommit = commitToken;
		clearCommittedDraft();
	});
</script>

{#if restored}
	<p class="text-status-good w-64 text-xs" role="status" data-testid="decision-draft-restored">
		Recovered your unsaved decision notes.
	</p>
{/if}

{#if conflict}
	<div
		class="border-status-warn bg-status-warn/10 w-64 rounded-md border p-2 text-xs"
		data-testid="decision-draft-conflict"
	>
		<p>Saved decision notes were typed from an older version of this talk.</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="underline" onclick={useSavedDraft}>Use saved notes</button>
			<button type="button" class="underline" onclick={discardSavedDraft}>Discard them</button>
		</div>
	</div>
{/if}

{#if status !== 'accepted'}
	<div class="flex w-64 flex-col gap-1" data-testid="accept-condition">
		<label class="block">
			<span class="text-xs font-medium">Condition on this accept</span>
			<input
				name="condition"
				type="text"
				maxlength="280"
				placeholder="If they bring a co-presenter…"
				class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
				data-testid="accept-condition-text"
				bind:value={condition}
				oninput={syncDraft}
			/>
		</label>
		<p class="text-muted-foreground text-[0.65rem] leading-snug">
			The committee sees this. The speaker does not.
		</p>
		{#key commitToken}
			<AppSelect
				name="conditionOwnerId"
				value={conditionOwnerId}
				options={ownerOptions}
				size="sm"
				aria-label="Who follows up"
				testId="accept-condition-owner"
				onValueChange={(value) => {
					conditionOwnerId = value;
					syncDraft();
				}}
			/>
		{/key}
		<p class="text-muted-foreground text-[0.65rem] leading-snug">
			The organizer who will chase it. Speakers never see this name.
		</p>
	</div>
{/if}

{#if status !== 'resubmit_with_guidance'}
	<label class="block w-64">
		<span class="text-xs font-medium">What they should change</span>
		<input
			name="guidance"
			type="text"
			maxlength="280"
			placeholder="Resubmit with your client…"
			class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
			data-testid="resubmit-guidance-text"
			bind:value={guidance}
			oninput={syncDraft}
		/>
		<span class="text-muted-foreground mt-0.5 block text-[0.65rem] leading-snug">
			The speaker will see this in their portal, and in the email when you notify them.
		</span>
	</label>
{/if}

{#if status !== 'rejected'}
	<label class="block w-64">
		<span class="text-xs font-medium">Note with the rejection (optional)</span>
		<input
			name="declineNote"
			type="text"
			maxlength="280"
			placeholder="One sentence from the champion"
			class="border-input bg-background mt-0.5 w-full rounded-md border px-2 py-1 text-xs"
			data-testid="decline-note-text"
			bind:value={declineNote}
			oninput={syncDraft}
		/>
		<span class="text-muted-foreground mt-0.5 block text-[0.65rem] leading-snug">
			The speaker will see this in their portal, and in the email when you notify them.
		</span>
	</label>
{/if}
