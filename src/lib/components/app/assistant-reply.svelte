<script lang="ts">
	/**
	 * Assistant markdown as text nodes, same contract as call-prose (#703).
	 *
	 * The model emits tables, bold and lists. `{@html}` is how those would
	 * become markup from a tool result; this prints the parsed tree instead.
	 * `renderAssistantMarkdown` is the same tree walked to a string, for the
	 * unit test that sends the live room table through the pipeline.
	 */
	import { assistantBlocks, type AssistantBlock } from '$lib/chat/assistant-markdown';
	import type { Inline } from '$lib/conference/prose';

	let { text }: { text: string } = $props();
	const blocks = $derived(assistantBlocks(text));
</script>

{#snippet inline(nodes: Inline[])}
	{#each nodes as node, i (i)}
		{#if node.kind === 'strong'}
			<strong class="font-semibold">{node.text}</strong>
		{:else if node.kind === 'em'}
			<em>{node.text}</em>
		{:else if node.kind === 'code'}
			<code class="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{node.text}</code>
		{:else if node.kind === 'link'}
			<a
				class="underline underline-offset-2"
				href={node.href}
				rel="noopener noreferrer nofollow"
				target="_blank">{node.text}</a
			>
		{:else}{node.text}{/if}
	{/each}
{/snippet}

{#snippet block(item: AssistantBlock, i: number)}
	{#if item.kind === 'table'}
		<div class="border-border overflow-x-auto rounded-md border {i > 0 ? 'mt-2' : ''}">
			<table class="w-max min-w-full border-collapse text-xs">
				<thead>
					<tr>
						{#each item.headers as cell, c (c)}
							<th
								class="border-border bg-muted/50 border px-2 py-1 text-left font-medium whitespace-nowrap"
							>
								{@render inline(cell)}
							</th>
						{/each}
					</tr>
				</thead>
				{#if item.rows.length}
					<tbody>
						{#each item.rows as row, r (r)}
							<tr>
								{#each row as cell, c (c)}
									<td class="border-border border px-2 py-1 whitespace-nowrap">
										{@render inline(cell)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				{/if}
			</table>
		</div>
	{:else if item.kind === 'heading'}
		{#if item.level === 3}
			<h3 class="text-base font-semibold tracking-tight {i > 0 ? 'mt-3' : ''}">
				{@render inline(item.content)}
			</h3>
		{:else if item.level === 4}
			<h4 class="font-semibold {i > 0 ? 'mt-3' : ''}">{@render inline(item.content)}</h4>
		{:else}
			<h5 class="text-muted-foreground font-semibold {i > 0 ? 'mt-2' : ''}">
				{@render inline(item.content)}
			</h5>
		{/if}
	{:else if item.kind === 'rule'}
		<hr class="border-border my-3" />
	{:else if item.kind === 'paragraph'}
		<p class={i > 0 ? 'mt-2' : ''}>{@render inline(item.content)}</p>
	{:else if item.ordered}
		<ol class="list-decimal space-y-1 pl-4 {i > 0 ? 'mt-2' : ''}">
			{#each item.items as entry, j (j)}
				<li>{@render inline(entry)}</li>
			{/each}
		</ol>
	{:else}
		<ul class="list-disc space-y-1 pl-4 {i > 0 ? 'mt-2' : ''}">
			{#each item.items as entry, j (j)}
				<li>{@render inline(entry)}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="text-foreground text-sm leading-6" data-testid="assistant-markdown">
	{#each blocks as item, i (i)}
		{@render block(item, i)}
	{/each}
</div>
