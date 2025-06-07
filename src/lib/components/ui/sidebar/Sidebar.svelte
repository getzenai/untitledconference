<script lang="ts">
	import { page } from '$app/stores';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Item {
		href: string;
		title: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: any;
	}

	interface $$Props extends HTMLAttributes<HTMLElement> {
		items: Item[];
	}

	export let items: Item[];

	let className: $$Props['class'] = undefined;
	export { className as class };
</script>

<nav class={cn('flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1', className)} {...$$restProps}>
	{#each items as item}
		<a
			href={item.href}
			class={cn(
				buttonVariants({ variant: 'ghost' }),
				$page.url.pathname === item.href
					? 'bg-muted hover:bg-muted'
					: 'hover:bg-transparent hover:underline',
				'justify-start'
			)}
		>
			{#if item.icon}
				<svelte:component this={item.icon} class="mr-2 h-4 w-4" />
			{/if}
			{item.title}
		</a>
	{/each}
</nav>