<script lang="ts">
	/**
	 * SSR stand-in for the parent `(protected)` layout. Conference chrome
	 * calls `useSidebar()`, which only exists under `Sidebar.Provider`.
	 */
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import Layout from './+layout.svelte';
	import type { Snippet } from 'svelte';

	let {
		data,
		children
	}: {
		data: never;
		children: Snippet;
	} = $props();
</script>

<Sidebar.Provider>
	<Layout {data}>{@render children()}</Layout>
</Sidebar.Provider>
