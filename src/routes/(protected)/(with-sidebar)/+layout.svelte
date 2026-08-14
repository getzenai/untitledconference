<script lang="ts">
	/**
	 * Inset for the non-conference surfaces. AppSidebar and its Provider live
	 * one level up so they stay mounted when the organizer opens a conference.
	 */
	import AppShellHeader from '$lib/components/app-shell-header.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	let { children } = $props();
</script>

<Sidebar.Inset>
	<AppShellHeader />
	<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
		{@render children()}
	</div>
</Sidebar.Inset>
