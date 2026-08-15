<script lang="ts">
	/**
	 * Reviewer chat panel. Hidden unless FEATURE_INAPP_CHAT is on — the page
	 * decides; this component assumes it is meant to be on the screen.
	 *
	 * Tool parts are named `tool-<name>` by the AI SDK. Read tools just print
	 * the name. `submit_review` stops for a yes before it writes, and the
	 * history line names the talk afterwards (#302).
	 */
	import { Chat } from '@ai-sdk/svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		DefaultChatTransport,
		getToolName,
		isToolUIPart,
		lastAssistantMessageIsCompleteWithApprovalResponses
	} from 'ai';
	import { onMount } from 'svelte';
	import SendIcon from '@lucide/svelte/icons/send';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { chatErrorMessage } from './reviewer-chat-error';
	import { describeReviewWrite, previewReviewWrite } from './reviewer-chat-write';

	let {
		slug,
		focus = undefined
	}: {
		slug: string;
		focus?: { submissionId: number; title: string };
	} = $props();

	let input = $state('');
	let chat = $state<Chat | null>(null);
	let invalidatedFor = $state<string | null>(null);

	onMount(() => {
		chat = new Chat({
			transport: new DefaultChatTransport({
				api: `/review/${slug}/chat`,
				body: focus ? { focus } : {}
			}),
			sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
		});
	});

	const pending = $derived(chat?.status === 'submitted' || chat?.status === 'streaming');

	$effect(() => {
		if (!chat) return;
		for (const message of chat.messages) {
			for (const part of message.parts) {
				if (!isToolUIPart(part)) continue;
				if (getToolName(part) !== 'submit_review') continue;
				if (part.state !== 'output-available') continue;
				if (invalidatedFor === part.toolCallId) continue;
				invalidatedFor = part.toolCallId;
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

	function decide(id: string, approved: boolean) {
		if (!chat) return;
		void chat.addToolApprovalResponse({ id, approved });
	}
</script>

<section
	class="border-border bg-card mt-8 rounded-lg border p-4"
	data-testid="reviewer-chat"
	aria-label="Review assistant"
>
	<h2 class="text-sm font-semibold tracking-tight">Review assistant</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Ask about your assigned reviews. It can look them up and file one after you confirm.
	</p>

	<ul class="mt-4 flex flex-col gap-3">
		{#if chat}
			{#each chat.messages as message (message.id)}
				<li class="text-sm" data-role={message.role}>
					<div class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						{message.role === 'user' ? 'You' : 'Assistant'}
					</div>
					<div class="mt-1 flex flex-col gap-1.5">
						{#each message.parts as part, partIndex (partIndex)}
							{#if part.type === 'text'}
								<p class="whitespace-pre-wrap">{part.text}</p>
							{:else if isToolUIPart(part) && getToolName(part) === 'submit_review' && part.state === 'approval-requested' && part.approval}
								<div
									class="border-border bg-background rounded-md border p-3"
									data-testid="chat-review-confirm"
								>
									<p>{previewReviewWrite(part.input ?? {}, focus?.title)}</p>
									<div class="mt-2 flex gap-2">
										<Button
											type="button"
											size="sm"
											data-testid="chat-review-confirm-yes"
											onclick={() => decide(part.approval.id, true)}
										>
											File it
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											data-testid="chat-review-confirm-no"
											onclick={() => decide(part.approval.id, false)}
										>
											Don't
										</Button>
									</div>
								</div>
							{:else if isToolUIPart(part) && getToolName(part) === 'submit_review' && part.state === 'output-available'}
								<p
									class="bg-status-good-bg text-status-good w-fit rounded-md px-2 py-0.5 text-xs"
									data-testid="chat-review-saved"
								>
									{describeReviewWrite(part.input ?? {}, focus?.title)}
								</p>
							{:else if isToolUIPart(part) && getToolName(part) === 'submit_review' && part.state === 'output-denied'}
								<p class="text-muted-foreground text-xs" data-testid="chat-review-denied">
									Review not filed.
								</p>
							{:else if isToolUIPart(part)}
								<p
									class="bg-muted text-muted-foreground w-fit rounded-md px-2 py-0.5 font-mono text-xs"
									data-testid="chat-tool-name"
								>
									{getToolName(part)}
								</p>
							{/if}
						{/each}
					</div>
				</li>
			{/each}
		{/if}
		{#if pending}
			<li class="text-muted-foreground text-sm" data-testid="chat-pending">Looking that up…</li>
		{/if}
	</ul>

	{#if chat?.error}
		<p
			class="border-status-bad text-status-bad mt-3 rounded-md border px-3 py-2 text-sm"
			role="alert"
			data-testid="chat-error"
		>
			{chatErrorMessage(chat.error)}
		</p>
	{/if}

	<form class="mt-4 flex gap-2" onsubmit={handleSubmit}>
		<Input
			bind:value={input}
			placeholder="Which reviews do I still have open?"
			autocomplete="off"
			disabled={!chat || pending}
			data-testid="reviewer-chat-input"
		/>
		<Button type="submit" size="icon" disabled={!chat || pending} aria-label="Send">
			<SendIcon />
		</Button>
	</form>
</section>
