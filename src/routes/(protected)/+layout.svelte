<script lang="ts">
	import { page } from '$app/stores';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	let { children } = $props();

	// Generate breadcrumbs based on current route
	const breadcrumbs = $derived.by(() => {
		const path = $page.url.pathname;
		const segments = path.split('/').filter(Boolean);

		if (segments.length === 0) {
			return [{ label: 'Home', href: '/', current: true }];
		}

		const items = [{ label: 'Home', href: '/', current: false }];
		let currentPath = '';

		segments.forEach((segment, index) => {
			currentPath += `/${segment}`;
			const isLast = index === segments.length - 1;

			// Handle special cases
			let label = segment;
			if (segment === 'documents') {
				label = 'Documents';
			} else if (!isNaN(Number(segment))) {
				// For document IDs, use a more descriptive label
				if (segments[index - 1] === 'documents') {
					label = $page.data.document?.title || 'Document';
				} else {
					label = segment;
				}
			} else {
				// Capitalize first letter
				label = segment.charAt(0).toUpperCase() + segment.slice(1);
			}

			items.push({
				label,
				href: currentPath,
				current: isLast
			});
		});

		return items;
	});
</script>

<Sidebar.Provider>
	<AppSidebar user={$page.data.user} variant="inset" data-testid="app-sidebar" />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2">
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						{#each breadcrumbs as item, index}
							{#if index > 0}
								<Breadcrumb.Separator />
							{/if}
							<Breadcrumb.Item>
								{#if item.current}
									<Breadcrumb.Page>{item.label}</Breadcrumb.Page>
								{:else}
									<Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
								{/if}
							</Breadcrumb.Item>
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
