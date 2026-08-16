<script lang="ts">
	import { onMount } from 'svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';

	let {
		draftId,
		scope,
		owner,
		baseline,
		name,
		label,
		rows = 2,
		class: className,
		placeholder,
		required = false,
		testId,
		commitToken,
		onkeydown,
		ondirtychange
	}: {
		draftId: string;
		scope: string;
		owner: string;
		baseline: string;
		name: string;
		label: string;
		rows?: number;
		class?: string;
		placeholder?: string;
		required?: boolean;
		testId?: string;
		commitToken: number;
		onkeydown?: (event: KeyboardEvent) => void;
		ondirtychange: (draftId: string, dirty: boolean) => void;
	} = $props();

	let value = $state('');
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<string> | null>(null);
	let handledCommit = 0;

	function syncDraft(): void {
		if (!mounted || conflict) return;
		const dirty = value.length > 0;
		if (dirty) writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		else clearBrowserDraft(localStorage, scope, owner);
		ondirtychange(draftId, dirty);
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
		ondirtychange(draftId, false);
	}

	function clearCommittedDraft(): void {
		value = '';
		conflict = null;
		restored = false;
		clearBrowserDraft(localStorage, scope, owner);
		ondirtychange(draftId, false);
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
			conflict = result.draft;
			ondirtychange(draftId, true);
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
		Recovered your unsaved text.
	</p>
{/if}

{#if conflict}
	<div
		class="border-status-warn bg-status-warn/10 rounded-md border p-2 text-xs"
		data-testid="{testId}-conflict"
	>
		<p>The saved list changed after this text was written.</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="underline" onclick={useSavedDraft}>Use my text</button>
			<button type="button" class="underline" onclick={discardSavedDraft}>Discard it</button>
		</div>
	</div>
{/if}

<label class="block text-xs">
	<span class="text-muted-foreground">{label}</span>
	<Textarea
		{name}
		{rows}
		class={className}
		{placeholder}
		{required}
		data-testid={testId}
		bind:value
		oninput={syncDraft}
		{onkeydown}
	/>
</label>
