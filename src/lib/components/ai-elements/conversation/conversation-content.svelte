<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	export interface ConversationContentProps extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		children?: Snippet;
	}
</script>

<script lang="ts">
	/** The scrolling viewport. Registers itself as the element to follow. */
	import { getStickToBottomContext } from './stick-to-bottom-context.svelte.js';

	let {
		class: className,
		children,
		ref = $bindable(null),
		...restProps
	}: ConversationContentProps = $props();

	const context = getStickToBottomContext();
	let element: HTMLDivElement | undefined = $state();

	$effect(() => {
		ref = element ?? null;
	});

	$effect(() => {
		if (element) context.setElement(element);
	});
</script>

<div bind:this={element} class={cn('min-h-0 flex-1 overflow-y-auto', className)} {...restProps}>
	{@render children?.()}
</div>
