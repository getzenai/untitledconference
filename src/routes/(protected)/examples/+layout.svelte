<script lang="ts">
	import Sidebar from '$lib/components/ui/sidebar/Sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator';

	const sidebarNavItems = [
		{
			title: 'CRUD',
			href: '/examples/crud'
		},
		{
			title: 'Toast',
			href: '/examples/toast'
		}
	];
</script>

<div class="space-y-6 p-10 pb-16 md:block">
	<div class="space-y-0.5">
		<h2 class="text-2xl font-bold tracking-tight">Examples</h2>
		<p class="text-muted-foreground">An example section with a sidebar layout.</p>
	</div>
	<Separator class="my-6" />
	<div class="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
		<aside class="-mx-4 lg:w-1/5">
			<Sidebar items={sidebarNavItems} />
		</aside>
		<div class="flex-1 lg:max-w-4xl">
			<div class="space-y-6">
				<slot />
			</div>
		</div>
	</div>
</div>
