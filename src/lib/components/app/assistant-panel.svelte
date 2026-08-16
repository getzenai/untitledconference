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
	 *    it. The server decides the card. Auto-run writes skip it; the
	 *    launcher refreshes the page behind the sheet when those land.
	 *
	 * The message list follows the answer being streamed rather than the bottom
	 * of the list (#718) — see `ai-elements/conversation/` for why those are not
	 * the same thing.
	 *
	 * The Chat instance, its ledger and the unsent input live in the
	 * launcher. Closing this sheet unmounts it and must not drop the
	 * transcript or a half-typed question. The refresh effect lives next
	 * to them, not here. New chat is the only way to empty both (#728, #804).
	 */
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
	import { page } from '$app/state';
	import type { AssistantLedger } from '$lib/chat/assistant-ledger';
	import { assistantDescription, assistantSuggestions } from '$lib/chat/assistant-suggestions';
	import { toolInputLines, toolLabel } from '$lib/chat/tool-summary';
	import { chatErrorMessage } from '$lib/chat/chat-error';
	import AssistantReply from './assistant-reply.svelte';
	import type { Chat } from '@ai-sdk/svelte';
	import SendIcon from '@lucide/svelte/icons/send';
	import SquareIcon from '@lucide/svelte/icons/square';
	import { getToolName, isToolUIPart } from 'ai';

	let {
		open = $bindable(false),
		input = $bindable(''),
		chat,
		ledger,
		onclear
	}: {
		open?: boolean;
		input?: string;
		chat: Chat;
		ledger: AssistantLedger;
		onclear: () => void;
	} = $props();
	// Last message that already belonged to the stopped turn — never search
	// earlier finished answers. Lives on the ledger so a close mid-stop
	// still marks the turn when the sheet remounts.
	let stopFromIndex = $state<number | null>(ledger.stopFromIndex);

	const pending = $derived(chat.status === 'submitted' || chat.status === 'streaming');
	const suggestions = $derived(assistantSuggestions({ routeId: page.route.id }));
	const description = $derived(assistantDescription(page.route.id));
	const showSuggestions = $derived(chat.messages.length === 0 && !pending);
	let inputEl = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (stopFromIndex === null || pending) return;
		const turnMessages = chat.messages.slice(stopFromIndex);
		const lastAssistant = [...turnMessages]
			.reverse()
			.find((message) => message.role === 'assistant');
		const marked = lastAssistant ?? turnMessages.at(-1);
		if (marked) ledger.stopped.add(marked.id);
		stopFromIndex = null;
		ledger.stopFromIndex = null;
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || pending) return;
		input = '';
		void chat.sendMessage({ text });
	}

	function handleClear() {
		if (pending || chat.messages.length === 0) return;
		input = '';
		stopFromIndex = null;
		onclear();
	}

	function handleStop() {
		if (!pending) return;
		stopFromIndex = Math.max(0, chat.messages.length - 1);
		ledger.stopFromIndex = stopFromIndex;
		void chat.stop();
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		if (pending) return;
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	function decide(id: string, ok: boolean) {
		void chat.addToolApprovalResponse({ id, approved: ok });
	}

	function pickSuggestion(text: string) {
		if (pending) return;
		input = text;
		inputEl?.focus();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="flex w-full flex-col sm:max-w-md"
		data-testid="assistant-panel"
	>
		<Sheet.Header>
			<div class="flex items-start justify-between gap-3 pr-8">
				<div class="min-w-0">
					<Sheet.Title>Guus</Sheet.Title>
					<Sheet.Description data-testid="assistant-description">
						{description}
					</Sheet.Description>
				</div>
				{#if chat.messages.length > 0}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="shrink-0"
						data-testid="assistant-new-chat"
						disabled={pending}
						onclick={handleClear}
					>
						New chat
					</Button>
				{/if}
			</div>
		</Sheet.Header>

		<Conversation class="flex-1">
			<ConversationContent class="px-4">
				<ul class="flex flex-col gap-3" data-testid="assistant-messages">
					{#each chat.messages as message (message.id)}
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
									{#if ledger.stopped.has(message.id)}
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

		{#if chat.error}
			<p
				class="border-status-bad text-status-bad mx-4 rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="assistant-error"
			>
				{chatErrorMessage(chat.error)}
			</p>
		{/if}

		{#if showSuggestions}
			<div class="flex flex-wrap gap-2 px-4 pb-2" data-testid="assistant-suggestions">
				{#each suggestions as suggestion (suggestion.tool + suggestion.text)}
					<button
						type="button"
						class="border-border hover:bg-muted rounded-full border px-3 py-1 text-left text-xs"
						data-testid="assistant-suggestion"
						onclick={() => pickSuggestion(suggestion.text)}
					>
						{suggestion.text}
					</button>
				{/each}
			</div>
		{/if}

		<form class="flex items-end gap-2 px-4 pb-4" onsubmit={handleSubmit}>
			<Textarea
				bind:ref={inputEl}
				bind:value={input}
				placeholder="Ask Guus"
				autocomplete="off"
				rows={1}
				disabled={pending}
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
				<Button type="submit" size="icon" class="shrink-0" aria-label="Send">
					<SendIcon />
				</Button>
			{/if}
		</form>
	</Sheet.Content>
</Sheet.Root>
