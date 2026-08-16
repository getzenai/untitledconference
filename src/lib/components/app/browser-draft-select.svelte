<script lang="ts">
	/**
	 * A dropdown that parks the chosen value in the browser (#801).
	 *
	 * Same envelope as `browser-draft-input`: identity in the key, baseline
	 * from the last saved value. `BrowserDraftInput` wraps a text field and
	 * cannot sit on an `AppSelect` — that is why the public call kept
	 * thirteen text answers and dropped the two dropdowns.
	 *
	 * `AppSelect` can fire an empty `onValueChange` while it mounts. Ignore
	 * that until we are mounted, or a restored pick is wiped before the
	 * parked copy is read. A later empty choice must go through — see
	 * `chooseBrowserDraftSelect`.
	 */
	import { onMount } from 'svelte';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';
	import { chooseBrowserDraftSelect } from '$lib/forms/browser-draft-select';

	type SelectOption = { value: string; label: string };

	let {
		scope = '',
		owner = '',
		baseline = '',
		name,
		id,
		value: incoming = '',
		options,
		placeholder = '—',
		class: className,
		disabled = false,
		required = false,
		'aria-label': ariaLabel,
		'aria-invalid': ariaInvalid,
		testId,
		title,
		commitToken = 0,
		onValueChange
	}: {
		scope?: string;
		owner?: string;
		baseline?: string;
		name?: string;
		id?: string;
		value?: string | null;
		options: SelectOption[];
		placeholder?: string;
		class?: string;
		disabled?: boolean;
		required?: boolean;
		'aria-label'?: string;
		'aria-invalid'?: boolean;
		testId?: string;
		title?: string;
		commitToken?: number;
		onValueChange?: (value: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let value = $state(incoming ?? '');
	let mounted = false;
	let conflict = $state<BrowserDraft<string> | null>(null);
	let handledCommit = 0;

	function canPark(): boolean {
		return Boolean(owner && scope);
	}

	function dirtyNow(): boolean {
		return value !== baseline;
	}

	function emit(next: string): void {
		value = next;
		onValueChange?.(next);
	}

	function syncDraft(): void {
		if (conflict || !canPark()) return;
		if (dirtyNow()) writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		else clearBrowserDraft(localStorage, scope, owner);
	}

	function useSavedDraft(): void {
		if (!conflict) return;
		emit(conflict.value);
		conflict = null;
		syncDraft();
	}

	function discardSavedDraft(): void {
		conflict = null;
		emit(baseline);
		if (canPark()) clearBrowserDraft(localStorage, scope, owner);
	}

	function clearCommittedDraft(): void {
		emit(baseline);
		conflict = null;
		if (canPark()) clearBrowserDraft(localStorage, scope, owner);
	}

	function choose(next: string): void {
		const result = chooseBrowserDraftSelect(localStorage, {
			mounted,
			next,
			value,
			baseline,
			scope,
			owner,
			conflict: Boolean(conflict)
		});
		if (!result.accepted) return;
		emit(result.value);
	}

	onMount(() => {
		if (!canPark()) {
			mounted = true;
			return;
		}
		if (!dirtyNow()) {
			const result = readBrowserDraft(localStorage, {
				scope,
				owner,
				baseline,
				parse: (draft) => (typeof draft === 'string' ? draft : null)
			});
			if (result.status === 'current') {
				emit(result.draft.value);
			} else if (result.status === 'conflict') {
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

	$effect(() => {
		if (!mounted || conflict || !canPark()) return;
		if (value === baseline) {
			clearBrowserDraft(localStorage, scope, owner);
		}
	});
</script>

<div class={className}>
	{#if conflict}
		<div
			class="border-status-warn bg-status-warn/10 mb-2 rounded-md border p-2 text-xs"
			data-testid="{testId ?? (name ? `app-select-${name}` : 'app-select')}-conflict"
		>
			<p>The saved value changed after this choice was made.</p>
			<div class="mt-2 flex gap-2">
				<button type="button" class="underline" onclick={useSavedDraft}>Use my choice</button>
				<button type="button" class="underline" onclick={discardSavedDraft}>Discard it</button>
			</div>
		</div>
	{/if}

	<AppSelect
		{id}
		{name}
		{options}
		{placeholder}
		{disabled}
		{required}
		{testId}
		{title}
		aria-label={ariaLabel}
		aria-invalid={ariaInvalid}
		{value}
		onValueChange={choose}
	/>
</div>
