<script lang="ts">
	/**
	 * Reviewer chat panel. Hidden unless FEATURE_INAPP_CHAT is on — the page
	 * decides; this component assumes it is meant to be on the screen.
	 *
	 * Tool parts are named `tool-<name>` by the AI SDK. We render the name so
	 * a reviewer can see which tool produced the answer.
	 */
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
	import { onMount } from 'svelte';
	import SendIcon from '@lucide/svelte/icons/send';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { slug }: { slug: string } = $props();

	let input = $state('');
	let chat = $state<Chat | null>(null);

	onMount(() => {
		chat = new Chat({
			transport: new DefaultChatTransport({
				api: `/review/${slug}/chat`
			})
		});
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || !chat) return;
		input = '';
		void chat.sendMessage({ text });
	}
</script>

<section
	class="border-border bg-card mt-8 rounded-lg border p-4"
	data-testid="reviewer-chat"
	aria-label="Review assistant"
>
	<h2 class="text-sm font-semibold tracking-tight">Review assistant</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Ask about your assigned reviews. It can look them up; it cannot file one yet.
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
	</ul>

	<form class="mt-4 flex gap-2" onsubmit={handleSubmit}>
		<Input
			bind:value={input}
			placeholder="Which reviews do I still have open?"
			autocomplete="off"
			disabled={!chat}
			data-testid="reviewer-chat-input"
		/>
		<Button type="submit" size="icon" disabled={!chat} aria-label="Send">
			<SendIcon />
		</Button>
	</form>
</section>
