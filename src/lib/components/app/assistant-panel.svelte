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
	 *    it. The client has no list of write tools — the server decides, and a
	 *    tool it lets through writes without asking us.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { pageContext, visiblePageTitle } from '$lib/chat/page-context';
	import { pageFocus } from '$lib/chat/page-focus.svelte';
	import { toolInputLines, toolLabel } from '$lib/chat/tool-summary';
	import { chatErrorMessage } from '$lib/chat/chat-error';
	import AssistantReply from './assistant-reply.svelte';
	import { Chat } from '@ai-sdk/svelte';
	import SendIcon from '@lucide/svelte/icons/send';
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

	// A tool the user approved has just written something. The page behind the
	// sheet is now stale — reload its data so the change is visible without a
	// manual refresh.
	$effect(() => {
		if (!chat) return;
		for (const message of chat.messages) {
			for (const part of message.parts) {
				if (!isToolUIPart(part)) continue;
				if (part.state === 'approval-requested') approved.add(part.toolCallId);
				if (part.state !== 'output-available') continue;
				if (!approved.has(part.toolCallId) || invalidated.has(part.toolCallId)) continue;
				invalidated.add(part.toolCallId);
				void invalidateAll();
			}
		}
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || !chat || pending) return;
		input = '';
		void chat.sendMessage({ text });
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

		<ul class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
			{#each chat?.messages ?? [] as message (message.id)}
				<li class="text-sm" data-role={message.role}>
					<div class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						{message.role === 'user' ? 'You' : 'Assistant'}
					</div>
					<div class="mt-1 flex flex-col gap-1.5">
						{#each message.parts as part, partIndex (partIndex)}
							{#if part.type === 'text'}
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
							{:else if isToolUIPart(part) && part.state === 'output-denied'}
								<p class="text-muted-foreground text-xs" data-testid="assistant-denied">
									{toolLabel(getToolName(part))} — not done.
								</p>
							{:else if isToolUIPart(part)}
								<p
									class="bg-muted text-muted-foreground w-fit rounded-md px-2 py-0.5 font-mono text-xs"
									data-testid="assistant-tool-name"
								>
									{getToolName(part)}
								</p>
							{/if}
						{/each}
					</div>
				</li>
			{/each}
			{#if pending}
				<li class="text-muted-foreground text-sm" data-testid="assistant-pending">
					Looking that up…
				</li>
			{/if}
		</ul>

		{#if chat?.error}
			<p
				class="border-status-bad text-status-bad mx-4 rounded-md border px-3 py-2 text-sm"
				role="alert"
				data-testid="assistant-error"
			>
				{chatErrorMessage(chat.error)}
			</p>
		{/if}

		<form class="flex gap-2 px-4 pb-4" onsubmit={handleSubmit}>
			<Input
				bind:value={input}
				placeholder="What can I do on this page?"
				autocomplete="off"
				disabled={!chat || pending}
				data-testid="assistant-input"
			/>
			<Button type="submit" size="icon" disabled={!chat || pending} aria-label="Send">
				<SendIcon />
			</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
