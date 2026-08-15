<script lang="ts">
	/**
	 * Organizer chat on the agenda board. Hidden unless FEATURE_INAPP_CHAT is
	 * on — the page decides; this component assumes it is meant to be on screen.
	 *
	 * Every one of the four writes stops for a yes, because every one of them
	 * changes what an audience will be told. After a confirmed write the board
	 * is reloaded: the grid behind the panel is the thing the organizer is
	 * actually reading, and a chat that says "moved" over a stale grid is worse
	 * than no chat (#302).
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
	import {
		agendaWriteError,
		describeAgendaWrite,
		isAgendaWriteTool,
		previewAgendaWrite,
		type AgendaWriteTool,
		type BoardNames
	} from './agenda-chat-write';

	let {
		slug,
		day = undefined,
		names
	}: {
		slug: string;
		/** The day the board has open, as YYYY-MM-DD. */
		day?: string;
		names: BoardNames;
	} = $props();

	let input = $state('');
	let chat = $state<Chat | null>(null);
	// Deliberately not `$state`: this only remembers which calls have already
	// reloaded the board. Four write tools mean several finished calls can sit
	// in the history at once, and a reactive tracker the effect both reads and
	// writes would re-run itself with every new id. That is why this is a plain
	// Set and not the SvelteSet the rule below asks for: the effect already has
	// its dependency in `chat.messages`, and reactivity here is the bug.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const reloadedFor = new Set<string>();

	// The transport is built once; `day` rides on each request instead, so
	// switching day tabs mid-conversation does not drop the history.
	onMount(() => {
		chat = new Chat({
			transport: new DefaultChatTransport({
				api: `/manage/${slug}/agenda/chat`,
				body: () => (day ? { focus: { day } } : {})
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
				if (!isAgendaWriteTool(getToolName(part))) continue;
				if (part.state !== 'output-available') continue;
				// A refusal reaches this state too, and nothing changed behind it.
				if (agendaWriteError(part.output)) continue;
				if (reloadedFor.has(part.toolCallId)) continue;
				reloadedFor.add(part.toolCallId);
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
	data-testid="agenda-chat"
	aria-label="Programme assistant"
>
	<h2 class="text-sm font-semibold tracking-tight">Programme assistant</h2>
	<p class="text-muted-foreground mt-0.5 text-xs">
		Ask it to place, move, swap or unschedule a talk. Every change waits for your yes.
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
							{:else if isToolUIPart(part) && isAgendaWriteTool(getToolName(part)) && part.state === 'approval-requested' && part.approval}
								{@const write = getToolName(part) as AgendaWriteTool}
								<div
									class="border-border bg-background rounded-md border p-3"
									data-testid="chat-agenda-confirm"
								>
									<p>
										{previewAgendaWrite(write, part.input ?? {}, names, day)}
									</p>
									<div class="mt-2 flex gap-2">
										<Button
											type="button"
											size="sm"
											data-testid="chat-agenda-confirm-yes"
											onclick={() => decide(part.approval.id, true)}
										>
											Do it
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											data-testid="chat-agenda-confirm-no"
											onclick={() => decide(part.approval.id, false)}
										>
											Don't
										</Button>
									</div>
								</div>
							{:else if isToolUIPart(part) && isAgendaWriteTool(getToolName(part)) && part.state === 'output-available' && agendaWriteError(part.output)}
								<p
									class="bg-status-bad-bg text-status-bad w-fit rounded-md px-2 py-0.5 text-xs"
									data-testid="chat-agenda-refused"
								>
									Board unchanged: {agendaWriteError(part.output)}
								</p>
							{:else if isToolUIPart(part) && isAgendaWriteTool(getToolName(part)) && part.state === 'output-available'}
								{@const done = getToolName(part) as AgendaWriteTool}
								<p
									class="bg-status-good-bg text-status-good w-fit rounded-md px-2 py-0.5 text-xs"
									data-testid="chat-agenda-done"
								>
									{describeAgendaWrite(done, part.input ?? {}, names, day)}
								</p>
							{:else if isToolUIPart(part) && isAgendaWriteTool(getToolName(part)) && part.state === 'output-denied'}
								<p class="text-muted-foreground text-xs" data-testid="chat-agenda-denied">
									Board unchanged.
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
			<li class="text-muted-foreground text-sm" data-testid="chat-pending">Reading the board…</li>
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
			placeholder="Move the keynote to Main Hall at 09:00"
			autocomplete="off"
			disabled={!chat || pending}
			data-testid="agenda-chat-input"
		/>
		<Button type="submit" size="icon" disabled={!chat || pending} aria-label="Send">
			<SendIcon />
		</Button>
	</form>
</section>
