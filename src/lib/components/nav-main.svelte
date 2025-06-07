<script lang="ts">
	import { page } from '$app/stores';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { cn } from '$lib/utils.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		items
	}: {
		items: {
			title: string;
			url: string;
			// This should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon: any;
			isActive?: boolean;
			items?: {
				title: string;
				url: string;
			}[];
		}[];
	} = $props();
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as mainItem (mainItem.title)}
			<Collapsible.Root open={mainItem.isActive} class="w-full">
				<Sidebar.MenuItem>
					<Collapsible.Trigger
						data-testid={`toggle-${mainItem.title.toLowerCase()}`}
						class="group w-full"
					>
						<Sidebar.MenuButton tooltipContent={mainItem.title}>
							{#snippet child({ props })}
								<a
									href={mainItem.url}
									{...props}
									class={cn('flex w-full items-center', props.class as string)}
								>
									<mainItem.icon />
									<span class="mr-auto">{mainItem.title}</span>
									{#if mainItem.items?.length}
										<ChevronRightIcon
											class="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90"
										/>
									{/if}
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Collapsible.Trigger>
				</Sidebar.MenuItem>
				{#if mainItem.items?.length}
					<Collapsible.Content data-testid={`content-${mainItem.title.toLowerCase()}`}>
						<Sidebar.MenuSub>
							{#each mainItem.items as subItem (subItem.title)}
								<Sidebar.MenuSubItem>
									<Sidebar.MenuSubButton
										href={subItem.url}
										data-active={$page.url.pathname === subItem.url}
									>
										<span>{subItem.title}</span>
									</Sidebar.MenuSubButton>
								</Sidebar.MenuSubItem>
							{/each}
						</Sidebar.MenuSub>
					</Collapsible.Content>
				{/if}
			</Collapsible.Root>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
