<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { Component, ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		items,
		class: className
	}: {
		items: {
			title: string;
			url: string;
			icon: Component;
			external?: boolean;
		}[];
	} & ComponentProps<typeof Sidebar.Group> = $props();
</script>

<Sidebar.Group class={className}>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each items as item (item.title)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="sm">
						{#snippet child({ props })}
							<a
								{...props}
								href={item.url}
								target={item.external ? '_blank' : undefined}
								rel={item.external ? 'noopener noreferrer' : undefined}
							>
								<item.icon />
								<span>{item.title}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
