<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	export interface ConversationProps extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		children?: Snippet;
	}
</script>

<script lang="ts">
	/**
	 * The frame around a streamed conversation. It owns the follow state (see
	 * `stick-to-bottom-context.svelte.ts`) and positions the scroll button; the
	 * scrolling itself happens in `ConversationContent` inside it.
	 */
	import { setStickToBottomContext } from './stick-to-bottom-context.svelte.js';

	let {
		class: className,
		children,
		ref = $bindable(null),
		...restProps
	}: ConversationProps = $props();

	setStickToBottomContext();
</script>

<div
	bind:this={ref}
	class={cn('relative flex min-h-0 flex-col overflow-hidden', className)}
	role="log"
	{...restProps}
>
	{@render children?.()}
</div>
