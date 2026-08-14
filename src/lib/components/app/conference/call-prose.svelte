<script lang="ts">
	/**
	 * The organizer's call text, as body copy someone can actually read for two
	 * thousand words (#509).
	 *
	 * Everything here is a text node — `proseBlocks` returns values, never markup,
	 * and Svelte escapes what it prints, so no call text can become HTML on a page
	 * anyone can open. The single attribute a value reaches is a link's `href`,
	 * which the parser has already restricted to http, https and mailto.
	 *
	 * Sizing is deliberate: the old box used `text-sm text-muted-foreground`,
	 * which is right for a four-line note and punishing for a forty-line call.
	 * This is foreground text at reading leading, with headings that give the
	 * sections something to scan.
	 */
	import type { Inline, ProseBlock } from '$lib/conference/prose';

	// Blocks, not the raw text: the caller already parses once to decide whether
	// there is anything to show at all, and a call can be two thousand words.
	let { blocks, class: className = '' }: { blocks: ProseBlock[]; class?: string } = $props();
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

<div class="text-foreground text-sm leading-6 {className}">
	{#each blocks as block, i (i)}
		{#if block.kind === 'heading'}
			{#if block.level === 3}
				<h3 class="text-base font-semibold tracking-tight {i > 0 ? 'mt-6' : ''}">
					{@render inline(block.content)}
				</h3>
			{:else if block.level === 4}
				<h4 class="font-semibold {i > 0 ? 'mt-5' : ''}">{@render inline(block.content)}</h4>
			{:else}
				<h5 class="text-muted-foreground font-semibold {i > 0 ? 'mt-4' : ''}">
					{@render inline(block.content)}
				</h5>
			{/if}
		{:else if block.kind === 'rule'}
			<hr class="border-border my-6" />
		{:else if block.kind === 'paragraph'}
			<p class={i > 0 ? 'mt-3' : ''}>{@render inline(block.content)}</p>
		{:else if block.ordered}
			<ol class="space-y-1.5 {i > 0 ? 'mt-3' : ''}">
				{#each block.items as item, j (j)}
					<li class="flex gap-2">
						<span class="text-muted-foreground tabular-nums" aria-hidden="true">{j + 1}.</span>
						<span>{@render inline(item)}</span>
					</li>
				{/each}
			</ol>
		{:else}
			<ul class="space-y-1.5 {i > 0 ? 'mt-3' : ''}">
				{#each block.items as item, j (j)}
					<li class="flex gap-2">
						<span class="text-muted-foreground" aria-hidden="true">·</span>
						<span>{@render inline(item)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/each}
</div>
