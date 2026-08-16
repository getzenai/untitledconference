<script lang="ts">
	/**
	 * One tool call: status dot, derived phrase, optional argument context.
	 * Expanding shows input and output JSON. The approval card is not this.
	 */
	import { cn } from '$lib/utils';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible/index.js';
	import { toolContext, toolPhrase } from '$lib/chat/tool-phrase';
	import type { ToolUIPartState } from './group-tool-parts';

	let {
		type,
		toolState,
		input,
		output,
		errorText,
		class: className
	}: {
		type: string;
		toolState: ToolUIPartState;
		input?: unknown;
		output?: unknown;
		errorText?: string;
		class?: string;
	} = $props();

	const name = $derived(type.startsWith('tool-') ? type.slice('tool-'.length) : type);
	const phrase = $derived(toolPhrase(name, toolState));
	const context = $derived(toolContext(input));
	let open = $state(false);

	const dot = $derived(
		toolState === 'input-available' || toolState === 'input-streaming'
			? 'bg-status-warn animate-pulse'
			: toolState === 'output-error'
				? 'bg-status-bad'
				: toolState === 'output-denied'
					? 'bg-muted-foreground'
					: 'bg-status-good'
	);

	const hasDetail = $derived(input != null || output != null || Boolean(errorText));
</script>

{#if hasDetail}
	<Collapsible bind:open>
		<CollapsibleTrigger
			class={cn(
				'text-muted-foreground hover:text-foreground flex w-full items-center gap-2 py-1 text-left text-sm',
				className
			)}
			data-testid="assistant-tool-name"
			data-tool-name={name}
			data-tool-state={toolState}
		>
			<ChevronRightIcon class={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
			<span class={cn('size-2 shrink-0 rounded-full', dot)}></span>
			<span class="truncate">
				{phrase}{#if context}<span class="text-foreground/80"> {context}</span>{/if}
			</span>
		</CollapsibleTrigger>
		<CollapsibleContent class="mt-1 mb-1 ml-5">
			<div
				class="bg-muted max-h-48 overflow-auto rounded-md p-2 font-mono text-xs"
				data-testid="assistant-tool-detail"
			>
				{#if errorText}
					<div class="text-status-bad mb-1">
						<span class="font-semibold">Error:</span>
						{errorText}
					</div>
				{/if}
				{#if input}
					<div class={output ? 'mb-1' : ''}>
						<span class="text-muted-foreground font-semibold">Input:</span>
						<pre class="whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
					</div>
				{/if}
				{#if output}
					<div>
						<span class="text-muted-foreground font-semibold">Output:</span>
						<pre class="whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
					</div>
				{/if}
			</div>
		</CollapsibleContent>
	</Collapsible>
{:else}
	<div
		class={cn('text-muted-foreground flex items-center gap-2 py-1 text-sm', className)}
		data-testid="assistant-tool-name"
		data-tool-name={name}
		data-tool-state={toolState}
	>
		<span class={cn('size-2 shrink-0 rounded-full', dot)}></span>
		<span class="truncate">{phrase}</span>
	</div>
{/if}
