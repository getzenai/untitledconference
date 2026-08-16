<script lang="ts">
	/**
	 * A named field that parks what was typed in the browser (#761, #762, #766).
	 *
	 * `baseline` is the last saved server value — the conflict marker, same
	 * meaning as on `BrowserDraftTextarea`. `initial` is what the field shows
	 * (defaults to `baseline`, because this field *is* that saved value).
	 * Dirty is `value !== baseline`.
	 */
	import { onMount } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

	let {
		scope,
		owner,
		baseline,
		initial = baseline,
		name,
		id,
		type,
		class: className,
		placeholder,
		required = false,
		maxlength,
		rows,
		testId,
		'aria-label': ariaLabel,
		commitToken = 0,
		ondirtychange
	}: {
		scope: string;
		owner: string;
		baseline: string;
		initial?: string;
		name: string;
		id?: string;
		type?: 'text' | 'email';
		class?: string;
		placeholder?: string;
		required?: boolean;
		maxlength?: number;
		/** When set, this is a textarea with the same envelope as the input. */
		rows?: number;
		testId?: string;
		'aria-label'?: string;
		commitToken?: number;
		ondirtychange?: (dirty: boolean) => void;
	} = $props();

	// `initial` seeds the field once. A later baseline change is a save
	// (cleared below) or a conflict, not a live overwrite of what is typed.
	// svelte-ignore state_referenced_locally
	let value = $state(initial);
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<string> | null>(null);
	let handledCommit = 0;

	function dirtyNow(): boolean {
		return value !== baseline;
	}

	function reportDirty(dirty: boolean): void {
		ondirtychange?.(dirty);
	}

	function syncDraft(): void {
		// `oninput` can fire before `onMount` on a form that just appeared.
		// Park the keystroke anyway — otherwise the first visit writes nothing.
		if (conflict || !owner) return;
		const dirty = dirtyNow();
		if (dirty) writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		else clearBrowserDraft(localStorage, scope, owner);
		reportDirty(dirty);
	}

	function useSavedDraft(): void {
		if (!conflict) return;
		value = conflict.value;
		conflict = null;
		restored = dirtyNow();
		syncDraft();
	}

	function discardSavedDraft(): void {
		conflict = null;
		value = baseline;
		clearBrowserDraft(localStorage, scope, owner);
		reportDirty(false);
	}

	function clearCommittedDraft(): void {
		value = baseline;
		conflict = null;
		restored = false;
		clearBrowserDraft(localStorage, scope, owner);
		reportDirty(false);
	}

	onMount(() => {
		if (!owner) {
			mounted = true;
			return;
		}
		// If the organizer already typed into this instance, keep it.
		if (!dirtyNow()) {
			const result = readBrowserDraft(localStorage, {
				scope,
				owner,
				baseline,
				parse: (draft) => (typeof draft === 'string' ? draft : null)
			});
			if (result.status === 'current') {
				value = result.draft.value;
				restored = dirtyNow();
			} else if (result.status === 'conflict') {
				conflict = result.draft;
				reportDirty(true);
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

	$effect(() => {
		if (!mounted || conflict || !owner) return;
		// A successful save updates `baseline` to the typed value. Drop the copy.
		if (value === baseline) {
			clearBrowserDraft(localStorage, scope, owner);
			restored = false;
			reportDirty(false);
		}
	});
</script>

<div class={className}>
	{#if restored}
		<p class="text-status-good text-xs" role="status" data-testid="{testId}-restored">
			Recovered your unsaved text.
		</p>
	{/if}

	{#if conflict}
		<div
			class="border-status-warn bg-status-warn/10 rounded-md border p-2 text-xs"
			data-testid="{testId}-conflict"
		>
			<p>The saved value changed after this text was written.</p>
			<div class="mt-2 flex gap-2">
				<button type="button" class="underline" onclick={useSavedDraft}>Use my text</button>
				<button type="button" class="underline" onclick={discardSavedDraft}>Discard it</button>
			</div>
		</div>
	{/if}

	{#if rows}
		<Textarea
			{id}
			{name}
			{rows}
			{placeholder}
			{required}
			{maxlength}
			class="w-full"
			aria-label={ariaLabel}
			data-testid={testId}
			bind:value
			oninput={syncDraft}
		/>
	{:else}
		<Input
			{id}
			{name}
			{type}
			{placeholder}
			{required}
			{maxlength}
			class="w-full"
			aria-label={ariaLabel}
			data-testid={testId}
			bind:value
			oninput={syncDraft}
		/>
	{/if}
</div>
