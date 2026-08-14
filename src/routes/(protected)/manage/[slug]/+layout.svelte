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
<Sidebar.Inset>
	<AppShellHeader />
	{@render children()}
</Sidebar.Inset>
