<script lang="ts">
	/**
	 * Consecutive tool calls as one run (#720). Finished calls fold behind
	 * "Used N tools"; the last two stay visible while work is in flight.
	 */
	import { cn } from '$lib/utils';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible/index.js';
	import ToolLine from './tool-line.svelte';
	import { toolGroupSplit, toolGroupSummary, type ToolPart } from './group-tool-parts';

	let {
		parts,
		streaming = false,
		tailCount = 2,
		class: className
	}: {
		parts: ToolPart[];
		streaming?: boolean;
		tailCount?: number;
		class?: string;
	} = $props();

	let showEarlier = $state(false);
	const MIN_COLLAPSE = 2;

	const inFlight = $derived(
		parts.some((part) => part.state === 'input-streaming' || part.state === 'input-available')
	);
	const live = $derived(streaming || inFlight);
	const splitAt = $derived(toolGroupSplit(parts.length, live, tailCount, MIN_COLLAPSE));
	const earlier = $derived(parts.slice(0, splitAt));
	const tail = $derived(parts.slice(splitAt));
	const errorCount = $derived(earlier.filter((part) => part.state === 'output-error').length);
	const deniedCount = $derived(earlier.filter((part) => part.state === 'output-denied').length);
	const summary = $derived(toolGroupSummary(earlier));
</script>

<div class={cn('py-1', className)} data-testid="assistant-tool-group">
	{#if earlier.length > 0}
		<Collapsible bind:open={showEarlier}>
			<CollapsibleTrigger
				class="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 py-1 text-sm"
				data-testid="assistant-tool-summary"
			>
				<ChevronRightIcon
					class={cn('size-3 shrink-0 transition-transform', showEarlier && 'rotate-90')}
				/>
				<span
					class={cn(
						'size-2 shrink-0 rounded-full',
						errorCount > 0
							? 'bg-status-bad'
							: deniedCount > 0
								? 'bg-muted-foreground'
								: 'bg-status-good'
					)}
				></span>
				<span>{summary}</span>
			</CollapsibleTrigger>
			<CollapsibleContent class="border-border ml-4 border-l pl-2">
				{#each earlier as part, index (index)}
					<ToolLine
						type={part.type}
						toolState={part.state}
						input={part.input}
						output={part.output}
						errorText={part.errorText}
					/>
				{/each}
			</CollapsibleContent>
		</Collapsible>
	{/if}

	{#each tail as part, index (`${splitAt}-${index}`)}
		<ToolLine
			type={part.type}
			toolState={part.state}
			input={part.input}
			output={part.output}
			errorText={part.errorText}
		/>
	{/each}
</div>
