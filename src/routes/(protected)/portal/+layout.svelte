<script lang="ts">
	/**
	 * Speaker portal chrome. Outside (with-sidebar), so Home + Log out must live
	 * here — speakers never reach NavUser without this bar.
	 */
	import ShellAccountLinks from '$lib/components/shell-account-links.svelte';

	let { children } = $props();
</script>

<div class="bg-background text-foreground min-h-svh">
	<header class="border-border bg-card border-b px-6 py-3">
		<div class="mx-auto flex max-w-4xl items-center justify-end">
			<ShellAccountLinks />
		</div>
	</header>
	{@render children()}
</div>
