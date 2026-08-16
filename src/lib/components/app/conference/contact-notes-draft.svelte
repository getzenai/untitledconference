<script lang="ts">
	/**
	 * A parked textarea on the contact profile. Typed text lives in
	 * browser-draft until Save succeeds — a rail click must not throw
	 * it away (#765, #789). The page owns the leave guard.
	 */
	import { onMount } from 'svelte';
	import { contactFieldScope } from '$lib/conference/contact-notes-draft';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

	let {
		contactId,
		owner,
		baseline,
		fieldId,
		name = 'notes',
		label = 'Internal notes',
		noun = 'notes',
		testId = 'contact-notes',
		placeholder = 'Only organizers see this.',
		rows = 3,
		scopeField = 'notes',
		commitToken = 0,
		ondirtychange
	}: {
		contactId: number;
		owner: string;
		baseline: string;
		fieldId: string;
		name?: string;
		label?: string;
		noun?: string;
		testId?: string;
		placeholder?: string;
		rows?: number;
		scopeField?: string;
		commitToken?: number;
		ondirtychange?: (dirty: boolean) => void;
	} = $props();

	// The page remounts after invalidate. Re-seeding from props would overwrite
	// the text the organizer is still typing.
	// svelte-ignore state_referenced_locally
	const scope = contactFieldScope(contactId, scopeField);
	// svelte-ignore state_referenced_locally
	let value = $state(baseline);
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<string> | null>(null);
	let handledCommit = 0;

	function dirtyNow(): boolean {
		return Boolean(conflict) || value !== baseline;
	}

	function reportDirty(): void {
		ondirtychange?.(dirtyNow());
	}

	function syncDraft(): void {
		if (!mounted || conflict) return;
		if (value !== baseline) {
			writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		} else {
			clearBrowserDraft(localStorage, scope, owner);
			restored = false;
		}
		reportDirty();
	}

	function useSavedDraft(): void {
		if (!conflict) return;
		value = conflict.value;
		conflict = null;
		restored = true;
		syncDraft();
	}

	function discardSavedDraft(): void {
		conflict = null;
		clearBrowserDraft(localStorage, scope, owner);
		reportDirty();
	}

	function clearCommittedDraft(): void {
		value = baseline;
		conflict = null;
		restored = false;
		clearBrowserDraft(localStorage, scope, owner);
		reportDirty();
	}

	onMount(() => {
		const result = readBrowserDraft(localStorage, {
			scope,
			owner,
			baseline,
			parse: (draft) => (typeof draft === 'string' ? draft : null)
		});
		if (result.status === 'current') {
			value = result.draft.value;
			restored = true;
		} else if (result.status === 'conflict') {
			if (result.draft.value === baseline) {
				clearBrowserDraft(localStorage, scope, owner);
			} else {
				conflict = result.draft;
			}
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
	<p class="text-status-good text-xs" role="status" data-testid="{testId}-restored">
		Recovered your unsaved {noun}.
	</p>
{/if}

{#if conflict}
	<div
		class="border-status-warn bg-status-warn/10 rounded-md border p-2 text-xs"
		data-testid="{testId}-conflict"
	>
		<p>The saved {noun} changed after this draft was written.</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="underline" onclick={useSavedDraft}>Use my {noun}</button>
			<button type="button" class="underline" onclick={discardSavedDraft}
				>Keep the saved {noun}</button
			>
		</div>
	</div>
{/if}

<label class="text-muted-foreground mb-1 block text-xs font-medium" for={fieldId}>
	{label}
</label>
<textarea
	id={fieldId}
	{name}
	{rows}
	class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
	{placeholder}
	data-testid={testId}
	bind:value
	oninput={syncDraft}
></textarea>
