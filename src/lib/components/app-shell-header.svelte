<script lang="ts">
	/**
	 * The slim top bar both shells share: open the rail, switch the theme.
	 * The account menu lives in `AppSidebar`'s footer, not here.
	 */
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
</script>

<header class="flex h-16 shrink-0 items-center gap-2">
	<div class="flex flex-1 items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
	</div>
	<div class="px-4">
		<ModeToggle />
	</div>
</header>
