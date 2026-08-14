<script lang="ts">
	/**
	 * Conference workspace chrome (#410).
	 *
	 * The handwritten aside is gone. The destinations live in
	 * `ConferenceSidebar` (a real `Sidebar.Root`) next to the icon app rail
	 * that the parent layout keeps mounted. Entering this layout collapses
	 * that rail; leaving restores whatever state it had, so a trip through
	 * a conference does not reset the app sidebar's open/scroll.
	 */
	import { onMount } from 'svelte';
	import AppShellHeader from '$lib/components/app-shell-header.svelte';
	import ConferenceSidebar from '$lib/components/conference-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { data, children } = $props();

	const sidebar = Sidebar.useSidebar();

	onMount(() => {
		const wasOpen = sidebar.open;
		sidebar.setOpen(false);
		return () => sidebar.setOpen(wasOpen);
	});
</script>

<ConferenceSidebar conference={data.conference} />
<Sidebar.Inset>
	<AppShellHeader />
	{@render children()}
</Sidebar.Inset>
