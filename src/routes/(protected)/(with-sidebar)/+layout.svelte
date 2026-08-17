<script lang="ts">
	/**
	 * Inset for the non-conference surfaces. AppSidebar and its Provider live
	 * one level up so they stay mounted when the organizer opens a conference.
	 */
	import AppShellHeader from '$lib/components/app-shell-header.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	let { children } = $props();
</script>

<!--
	`min-w-0` is load-bearing (#470). A flex item defaults to `min-width: auto`,
	so one wide child — a table with an unbroken 600-character title in it — made
	this column wider than the viewport, and the *document* scrolled sideways
	instead of the table. The fixed sidebar then slid out of view and never came
	back: "Dashboard" read "ashboard". The scroll belongs to the table's own box,
	which `ScrollTable` already owns.

	`data-after-star` is the scrolling column the launcher reserves below md
	(#875). The star marks itself; this is the content that starts after it.
-->
<Sidebar.Inset class="min-w-0">
	<AppShellHeader />
	<div class="flex flex-1 flex-col gap-4 p-4 pt-0" data-after-star>
		{@render children()}
	</div>
</Sidebar.Inset>
