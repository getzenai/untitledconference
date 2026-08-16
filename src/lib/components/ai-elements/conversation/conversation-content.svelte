<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	export interface ConversationContentProps extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		children?: Snippet;
		/** Where to open on a conversation that already has messages; `null` is the end (#729). */
		initialOffset?: number | null;
	}
</script>

<script lang="ts">
	/** The scrolling viewport. Registers itself as the element to follow. */
	import { getStickToBottomContext } from './stick-to-bottom-context.svelte.js';

	let {
		class: className,
		children,
		ref = $bindable(null),
		initialOffset = null,
		...restProps
	}: ConversationContentProps = $props();

	const context = getStickToBottomContext();
	let element: HTMLDivElement | undefined = $state();

	$effect(() => {
		ref = element ?? null;
	});

	// Told before the element, so the first placement already knows where it
	// is going; the context does the scrolling, this only carries the number.
	$effect(() => {
		context.placeAt(initialOffset);
		if (element) context.setElement(element);
	});
</script>

<div bind:this={element} class={cn('min-h-0 flex-1 overflow-y-auto', className)} {...restProps}>
	{@render children?.()}
</div>
