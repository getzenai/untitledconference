<script lang="ts">
	/**
	 * The way in: a star pinned to the right edge of every app page (#676).
	 *
	 * The panel itself only mounts once it has been opened, so a user who
	 * never asks anything pays nothing for the chat runtime.
	 */
	import { Button } from '$lib/components/ui/button';
	import AssistantPanel from '$lib/components/app/assistant-panel.svelte';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	let open = $state(false);
	let everOpened = $state(false);

	function openPanel() {
		everOpened = true;
		open = true;
	}
</script>

<Button
	type="button"
	size="icon"
	class="fixed top-1/2 right-0 z-40 size-11 -translate-y-1/2 rounded-l-full rounded-r-none shadow-lg"
	aria-label="Ask Guus"
	data-testid="assistant-open"
	onclick={openPanel}
>
	<SparklesIcon />
</Button>

{#if everOpened}
	<AssistantPanel bind:open />
{/if}
