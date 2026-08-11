<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { cn } from '$lib/utils.js';

	let {
		items
	}: {
		items: {
			title: string;
			url: string;
			// This should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon: any;
		}[];
	} = $props();

	const isCurrent = (url: string) =>
		page.url.pathname === url || page.url.pathname.startsWith(`${url}/`);
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as mainItem (mainItem.title)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={mainItem.title} data-active={isCurrent(mainItem.url)}>
					{#snippet child({ props })}
						<a
							href={mainItem.url}
							{...props}
							class={cn('flex w-full items-center', props.class as string)}
						>
							<mainItem.icon />
							<span>{mainItem.title}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
