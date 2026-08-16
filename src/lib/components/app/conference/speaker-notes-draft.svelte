<script lang="ts">
	/**
	 * Internal notes on a speaker row. Typed text lives in browser-draft until
	 * Save profile succeeds — a rail click or a refused save must not throw it away.
	 */
	import { onMount } from 'svelte';
	import UnsavedGuard from '$lib/components/app/unsaved-guard.svelte';
	import {
		clearBrowserDraft,
		readBrowserDraft,
		writeBrowserDraft,
		type BrowserDraft
	} from '$lib/forms/browser-draft';
	import { speakerNotesDraftScope } from '$lib/conference/speaker-notes-draft';

	let {
		slug,
		speakerProfileId,
		owner,
		baseline,
		fieldId
	}: {
		slug: string;
		speakerProfileId: number;
		owner: string;
		baseline: string;
		fieldId: string;
	} = $props();

	// The row remounts per speaker. Re-seeding from props on every parent
	// invalidation would overwrite the notes the organizer is still typing.
	// svelte-ignore state_referenced_locally
	const scope = speakerNotesDraftScope(slug, speakerProfileId);
	// svelte-ignore state_referenced_locally
	let value = $state(baseline);
	let mounted = false;
	let restored = $state(false);
	let conflict = $state<BrowserDraft<string> | null>(null);

	const dirty = $derived(!conflict && value !== baseline);

	function syncDraft(): void {
		if (!mounted || conflict) return;
		if (value !== baseline) {
			writeBrowserDraft(localStorage, { scope, owner, baseline, value });
		} else {
			clearBrowserDraft(localStorage, scope, owner);
			restored = false;
		}
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
</script>

<UnsavedGuard
	{dirty}
	message="Your notes are saved in this browser but not on the server yet. Leave this page?"
/>

{#if restored}
	<p class="text-status-good text-xs" role="status" data-testid="edit-notes-restored">
		Recovered your unsaved notes.
	</p>
{/if}

{#if conflict}
	<div
		class="border-status-warn bg-status-warn/10 rounded-md border p-2 text-xs"
		data-testid="edit-notes-conflict"
	>
		<p>The saved notes changed after this draft was written.</p>
		<div class="mt-2 flex gap-2">
			<button type="button" class="underline" onclick={useSavedDraft}>Use my notes</button>
			<button type="button" class="underline" onclick={discardSavedDraft}
				>Keep the saved notes</button
			>
		</div>
	</div>
{/if}

<label class="text-muted-foreground mb-1 block text-xs font-medium" for={fieldId}>
	Internal notes
</label>
<textarea
	id={fieldId}
	name="notes"
	rows="2"
	class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
	data-testid="edit-notes"
	placeholder="Never shown publicly"
	bind:value
	oninput={syncDraft}
></textarea>
