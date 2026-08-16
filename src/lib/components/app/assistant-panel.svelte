<script lang="ts">
	/**
	 * The assistant, in a sheet on the right, on every page of the app (#676).
	 *
	 * It talks to `POST /chat`, which hands the model the same tools the MCP
	 * server exposes. Two things make it work as a *side* panel:
	 *
	 * 1. The page context is read at send time (`body` as a function), not at
	 *    mount. Otherwise the first page the user opened the panel on would
	 *    stick to the whole conversation while they navigate away.
	 * 2. Approval is rendered generically, over *any* tool part that asks for
	 *    it. The server decides the card. Auto-run writes skip it; the panel
	 *    still refreshes the page behind the sheet when those land.
	 *
	 * The message list follows the answer being streamed rather than the bottom
	 * of the list (#718) — see `ai-elements/conversation/` for why those are not
	 * the same thing.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import {
		Conversation,
		ConversationContent,
		ConversationScrollButton,
		MessageAnchor
	} from '$lib/components/ai-elements/conversation';
	import { groupMessageParts, ToolGroup, type GenericPart } from '$lib/components/ai-elements/tool';
	import { assistantWriteRefreshesPage } from '$lib/chat/auto-run-writes';
	import { pageContext, visiblePageTitle } from '$lib/chat/page-context';
	import { pageFocus } from '$lib/chat/page-focus.svelte';
	import { toolInputLines, toolLabel } from '$lib/chat/tool-summary';
	import { chatErrorMessage } from '$lib/chat/chat-error';
	import AssistantReply from './assistant-reply.svelte';
	import { Chat } from '@ai-sdk/svelte';
	import SendIcon from '@lucide/svelte/icons/send';
	import SquareIcon from '@lucide/svelte/icons/square';
	import {
		DefaultChatTransport,
		getToolName,
		isToolUIPart,
		lastAssistantMessageIsCompleteWithApprovalResponses
	} from 'ai';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let input = $state('');
	let chat = $state<Chat | null>(null);
	// Tool calls we stopped for, so we know which results changed the page.
	const approved = new SvelteSet<string>();
	const invalidated = new SvelteSet<string>();
	const stopped = new SvelteSet<string>();
	// Last message that already belonged to the stopped turn — never search
	// earlier finished answers.
	let stopFromIndex = $state<number | null>(null);

	onMount(() => {
		chat = new Chat({
			transport: new DefaultChatTransport({
				api: '/chat',
				body: () => {
					const context = pageContext({
						routeId: page.route.id,
						url: page.url,
						params: page.params,
						title: visiblePageTitle(document),
						focus: pageFocus(page.route.id)
					});
					return context ? { pageContext: context } : {};
				}
			}),
			sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
		});
	});

	const pending = $derived(chat?.status === 'submitted' || chat?.status === 'streaming');

	// A write has just landed. Gated writes enter `approved` when the card
	// appears; auto-run writes never do, and still change the page (#726).
	$effect(() => {
		if (!chat) return;
		for (const message of chat.messages) {
			for (const part of message.parts) {
				if (!isToolUIPart(part)) continue;
				if (part.state === 'approval-requested') approved.add(part.toolCallId);
				if (part.state !== 'output-available') continue;
				if (invalidated.has(part.toolCallId)) continue;
				if (!assistantWriteRefreshesPage(getToolName(part), approved.has(part.toolCallId))) {
					continue;
				}
				invalidated.add(part.toolCallId);
				void invalidateAll();
			}
		}
	});

	$effect(() => {
		if (stopFromIndex === null || !chat || pending) return;
		const turnMessages = chat.messages.slice(stopFromIndex);
		const lastAssistant = [...turnMessages]
			.reverse()
			.find((message) => message.role === 'assistant');
		const marked = lastAssistant ?? turnMessages.at(-1);
		if (marked) stopped.add(marked.id);
		stopFromIndex = null;
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || !chat || pending) return;
		input = '';
		void chat.sendMessage({ text });
	}

	function handleStop() {
		if (!chat || !pending) return;
		stopFromIndex = Math.max(0, chat.messages.length - 1);
		void chat.stop();
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		if (pending) return;
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	function decide(id: string, ok: boolean) {
		void chat?.addToolApprovalResponse({ id, approved: ok });
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="flex w-full flex-col sm:max-w-md"
		data-testid="assistant-panel"
	>
		<Sheet.Header>
			<Sheet.Title>Guus</Sheet.Title>
			<Sheet.Description>
				Ask about this page. It can look things up and change them once you say yes.
			</Sheet.Description>
		</Sheet.Header>

		<Conversation class="flex-1">
			<ConversationContent class="px-4">
				<ul class="flex flex-col gap-3" data-testid="assistant-messages">
					{#each chat?.messages ?? [] as message (message.id)}
						<li class="text-sm" data-role={message.role}>
							<MessageAnchor>
								<div class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									{message.role === 'user' ? 'You' : 'Assistant'}
								</div>
								<div class="mt-1 flex flex-col gap-1.5">
									{#each groupMessageParts(message.parts as GenericPart[]) as segment, segmentIndex (segmentIndex)}
										{#if segment.kind === 'tool-group'}
											<ToolGroup parts={segment.parts} streaming={pending} />
										{:else}
											{@const part = message.parts[segment.index]}
											{#if part.type === 'text' && part.text}
												<AssistantReply text={part.text} />
											{:else if isToolUIPart(part) && part.state === 'approval-requested' && part.approval}
												<div
													class="border-border bg-background rounded-md border p-3"
													data-testid="assistant-approval"
												>
													<p class="font-medium">{toolLabel(getToolName(part))}</p>
													<dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
														{#each toolInputLines(part.input) as line (line.key)}
															<dt class="text-muted-foreground">{line.key}</dt>
															<dd class="break-words">{line.value}</dd>
														{/each}
													</dl>
													<div class="mt-2 flex gap-2">
														<Button
															type="button"
															size="sm"
															data-testid="assistant-approve"
															onclick={() => decide(part.approval.id, true)}
														>
															Do it
														</Button>
														<Button
															type="button"
															size="sm"
															variant="outline"
															data-testid="assistant-deny"
															onclick={() => decide(part.approval.id, false)}
														>
															Don't
														</Button>
													</div>
												</div>
											{/if}
										{/if}
									{/each}
									{#if stopped.has(message.id)}
										<p class="text-muted-foreground text-xs" data-testid="assistant-stopped">
											Stopped
										</p>
									{/if}
								</div>
							</MessageAnchor>
						</li>
					{/each}
					{#if pending}
						<li class="text-muted-foreground text-sm" data-testid="assistant-pending">
							Looking that up…
						</li>
					{/if}
				</ul>
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>

		{#if chat?.error}
			<p
				class="border-status-bad text-status-bad mx-4 rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="assistant-error"
			>
				{chatErrorMessage(chat.error)}
			</p>
		{/if}

		<form class="flex items-end gap-2 px-4 pb-4" onsubmit={handleSubmit}>
			<Textarea
				bind:value={input}
				placeholder="What can I do on this page?"
				autocomplete="off"
				rows={1}
				disabled={!chat || pending}
				data-testid="assistant-input"
				class="max-h-48 min-h-9 min-w-0 flex-1 resize-none overflow-y-auto py-2"
				onkeydown={handleInputKeydown}
			/>
			{#if pending}
				<Button
					type="button"
					size="icon"
					class="shrink-0"
					aria-label="Stop"
					data-testid="assistant-stop"
					onclick={handleStop}
				>
					<SquareIcon />
				</Button>
			{:else}
				<Button type="submit" size="icon" class="shrink-0" disabled={!chat} aria-label="Send">
					<SendIcon />
				</Button>
			{/if}
		</form>
	</Sheet.Content>
</Sheet.Root>
