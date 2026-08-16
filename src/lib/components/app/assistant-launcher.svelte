<script lang="ts">
	/**
	 * The way in: a star pinned to the right edge of every app page (#676).
	 *
	 * Chat is created on first open and lives here, not in the sheet. Closing
	 * the panel unmounts the sheet and must not throw the transcript away
	 * (#728). A user who never asks pays nothing for the chat runtime.
	 */
	import { Button } from '$lib/components/ui/button';
	import AssistantPanel from '$lib/components/app/assistant-panel.svelte';
	import { createAssistantChat } from '$lib/chat/create-assistant-chat';
	import {
		clearAssistantHold,
		closeAssistantHold,
		emptyAssistantHold,
		openAssistantHold,
		type AssistantHold
	} from '$lib/chat/assistant-hold';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { Chat } from '@ai-sdk/svelte';

	let hold = $state<AssistantHold<Chat>>(emptyAssistantHold());

	function openPanel() {
		hold = openAssistantHold(hold, createAssistantChat);
	}

	function clearChat() {
		hold = clearAssistantHold(createAssistantChat);
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

{#if hold.open && hold.chat}
	<AssistantPanel
		bind:open={
			() => hold.open,
			(open) => {
				if (!open) hold = closeAssistantHold(hold);
			}
		}
		chat={hold.chat}
		ledger={hold.ledger}
		onclear={clearChat}
	/>
{/if}
