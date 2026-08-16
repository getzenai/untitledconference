<script lang="ts">
	/**
	 * One turn in the assistant list (#727). Alignment is the role:
	 * the user sits on the right, the answer takes the row.
	 */
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		from,
		class: className = '',
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		from: 'user' | 'assistant' | 'system';
		children?: Snippet;
	} = $props();
</script>

<div
	class={cn(
		'group flex w-full min-w-0',
		from === 'user' ? 'is-user justify-end' : 'is-assistant justify-start',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
