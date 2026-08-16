<script lang="ts" module>
	import { cn } from '$lib/utils';
	import type { ButtonProps } from '$lib/components/ui/button/index.js';

	/**
	 * `onclick` is deliberately not forwarded: this button has exactly one job,
	 * and a second handler on it would be a second meaning for the same press.
	 */
	export type ConversationScrollButtonProps = Omit<ButtonProps, 'onclick'>;
</script>

<script lang="ts">
	/**
	 * The way back down. It only exists while the reader is away from the end —
	 * a permanently visible button would be a permanent lie about where they are.
	 */
	import { Button } from '$lib/components/ui/button';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import { getStickToBottomContext } from './stick-to-bottom-context.svelte.js';
	import { fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';

	let { class: className, ...restProps }: ConversationScrollButtonProps = $props();

	const context = getStickToBottomContext();
</script>

{#if !context.isAtBottom}
	<div
		in:fly={{ duration: 300, y: 10, easing: backOut }}
		out:fly={{ duration: 200, y: 10, easing: backOut }}
		class="absolute bottom-4 left-1/2 -translate-x-1/2"
	>
		<Button
			class={cn('bg-background/80 hover:bg-background/90 rounded-full shadow-lg', className)}
			onclick={() => context.scrollToBottom()}
			size="icon"
			type="button"
			variant="outline"
			aria-label="Scroll to the latest message"
			data-testid="assistant-scroll-to-bottom"
			{...restProps}
		>
			<ArrowDownIcon class="size-4" />
		</Button>
	</div>
{/if}
