<script lang="ts">
	/**
	 * The way in: a star pinned to the edge of every app page (#676).
	 *
	 * Chat is created on first open and lives here, not in the sheet. Closing
	 * the panel unmounts the sheet and must not throw the transcript or a
	 * half-typed question away (#728, #804). A user who never asks pays
	 * nothing for the chat runtime.
	 *
	 * The refresh effect lives here too. The launcher stays mounted, so a
	 * write that finishes while the sheet is closed still invalidates the
	 * page — once. The panel must not own that effect: it dies on close.
	 *
	 * On a talk at phone width the star sits at the bottom so it does not
	 * cover Accept (#857). Above md, and on every other page, it stays
	 * vertically centred.
	 *
	 * Below md it docks on the left, not the right (#861). Right-edge
	 * actions — Assign/Unassign, and anything else that scrolls through
	 * that column — stay tappable. That is the relationship with
	 * scrolling content, not another per-page exception.
	 *
	 * Size and inset are --assistant-star-*. `data-assistant-star` is
	 * what reserves the column (#875), so a new page inherits it
	 * instead of naming the same numbers.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import AssistantPanel from '$lib/components/app/assistant-panel.svelte';
	import { createAssistantChat } from '$lib/chat/create-assistant-chat';
	import { cn } from '$lib/utils';
	import {
		clearAssistantHold,
		closeAssistantHold,
		emptyAssistantHold,
		openAssistantHold,
		rememberAssistantScroll,
		type AssistantHold
	} from '$lib/chat/assistant-hold';
	import { pageRefreshIds } from '$lib/chat/page-refresh-ids';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import type { Chat } from '@ai-sdk/svelte';

	let hold = $state<AssistantHold<Chat>>(emptyAssistantHold());

	// Deliberately not `$state`: nothing renders from it, and it is read once,
	// in the setter that closes the sheet — while the element is still there.
	let viewport: HTMLElement | null = null;

	// A write has just landed. Gated writes enter `approved` when the card
	// appears; auto-run writes never do, and still change the page (#726).
	// This runs whether the sheet is open or not (#728 / #802).
	$effect(() => {
		const chat = hold.chat;
		if (!chat) return;
		for (const id of pageRefreshIds(chat.messages, hold.ledger)) {
			hold.ledger.invalidated.add(id);
			void invalidateAll();
		}
	});

	function openPanel() {
		hold = openAssistantHold(hold, createAssistantChat);
	}

	function clearChat() {
		hold = clearAssistantHold(createAssistantChat);
	}

	const onTalkPage = $derived(/\/manage\/[^/]+\/submissions\/\d+$/.test(page.url.pathname));
</script>

<Button
	type="button"
	size="icon"
	class={cn(
		'fixed z-40 size-(--assistant-star-size) shadow-lg',
		'left-(--assistant-star-inset) rounded-l-none rounded-r-full md:right-0 md:left-auto md:rounded-l-full md:rounded-r-none',
		onTalkPage
			? 'bottom-6 md:top-1/2 md:bottom-auto md:-translate-y-1/2'
			: 'top-1/2 -translate-y-1/2'
	)}
	aria-label="Ask Guus"
	data-testid="assistant-open"
	data-assistant-star
	onclick={openPanel}
>
	<SparklesIcon />
</Button>

{#if hold.open && hold.chat}
	<AssistantPanel
		bind:open={
			() => hold.open,
			(open) => {
				if (open) return;
				// One assignment: close and keep the offset together. Reading it
				// here rather than on the way out is what keeps the write out of
				// the unmount, and the viewport is still mounted at this point.
				hold = rememberAssistantScroll(
					closeAssistantHold(hold),
					viewport ? viewport.scrollTop : hold.scrollTop
				);
				viewport = null;
			}
		}
		bind:input={
			() => hold.input,
			(value) => {
				hold.input = value;
			}
		}
		chat={hold.chat}
		ledger={hold.ledger}
		onclear={clearChat}
		initialScroll={hold.scrollTop}
		onviewport={(element) => (viewport = element)}
	/>
{/if}
