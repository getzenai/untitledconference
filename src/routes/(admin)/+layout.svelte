<script lang="ts">
	/**
	 * Admin chrome. The breadcrumb strip that used to sit here read "Admin / Users"
	 * on every admin page, hardcoded — on anything but the users page it was simply
	 * wrong, and on the users page it repeated the heading below it. Same treatment
	 * as the signed-in shell: keep the sidebar trigger, drop the fake trail.
	 */
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	let { children } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar user={page.data.user} variant="inset" data-testid="app-sidebar" />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2">
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
