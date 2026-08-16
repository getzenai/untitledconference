<script lang="ts">
	/**
	 * The body of a turn (#727). A user turn is a muted bubble capped at
	 * 80%; an answer is full-width prose with no chrome. The parent
	 * `Message` sets `.is-user` / `.is-assistant`.
	 *
	 * `bg-muted` on the sheet (`bg-background`) is the pairing that has
	 * to hold in the dark: muted is the next step up on the same scale
	 * (see the token test), not a second grey that collapses into the
	 * panel.
	 */
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		class: className = '',
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
	} = $props();
</script>

<div
	class={cn(
		'flex min-w-0 flex-col gap-2 overflow-hidden text-sm break-words',
		'group-[.is-user]:bg-muted group-[.is-user]:text-foreground group-[.is-user]:max-w-[80%] group-[.is-user]:rounded-lg group-[.is-user]:px-4 group-[.is-user]:py-3',
		'group-[.is-assistant]:text-foreground group-[.is-assistant]:w-full',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
