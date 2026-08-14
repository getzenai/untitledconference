<script lang="ts">
	/**
	 * Conference workspace chrome (#410).
	 *
	 * The handwritten aside is gone. The destinations live in
	 * `ConferenceSidebar` (a real `Sidebar.Root`) next to the icon app rail
	 * that the parent layout keeps mounted. Collapse and restore of that rail
	 * live on the parent — this layout must not snapshot first-paint `open`,
	 * or a bookmark into a conference restores the icon-only trick as if the
	 * organizer had chosen it.
	 */
	import AppShellHeader from '$lib/components/app-shell-header.svelte';
	import ConferenceSidebar from '$lib/components/conference-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { data, children } = $props();
</script>

<ConferenceSidebar conference={data.conference} />
<!--
	`min-w-0` is load-bearing (#470). A flex item defaults to `min-width: auto`,
	so one wide child — a table with an unbroken 600-character title in it — made
	this column wider than the viewport, and the *document* scrolled sideways
	instead of the table. The fixed sidebar then slid out of view and never came
	back: "Dashboard" read "ashboard". The scroll belongs to the table's own box,
	which `ScrollTable` already owns.
-->
<Sidebar.Inset class="min-w-0">
	<AppShellHeader />
	{@render children()}
</Sidebar.Inset>
