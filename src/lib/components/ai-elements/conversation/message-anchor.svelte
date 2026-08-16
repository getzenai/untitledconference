<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	export interface MessageAnchorProps extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		active?: boolean;
		children?: Snippet;
	}
</script>

<script lang="ts">
	/**
	 * Wraps one message and offers it as the thing the viewport follows. The
	 * last anchor to register wins, which is what we want: messages mount in
	 * order, so the newest one is the current one.
	 */
	import { getStickToBottomContext } from './stick-to-bottom-context.svelte.js';

	let {
		active = true,
		class: className,
		children,
		ref = $bindable(null),
		...restProps
	}: MessageAnchorProps = $props();

	const context = getStickToBottomContext();
	let element: HTMLDivElement | undefined = $state();

	$effect(() => {
		ref = element ?? null;
	});

	$effect(() => {
		if (!active || !element) return;
		return context.followMessage(element);
	});
</script>

<div bind:this={element} class={cn(className)} {...restProps}>
	{@render children?.()}
</div>
