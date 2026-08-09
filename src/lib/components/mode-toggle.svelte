<script lang="ts">
	/**
	 * Light/dark switch.
	 *
	 * The dark palette has always existed in the tokens; until now nothing could
	 * reach it — no `ModeWatcher`, no control. `mode-watcher` was already a
	 * dependency (the toast component pulls it in), so this is the missing button,
	 * not a new mechanism.
	 */

	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import Button from '$lib/components/ui/button/button.svelte';

	let { class: className }: { class?: string } = $props();
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleMode}
	class="relative size-9 shrink-0 {className ?? ''}"
	aria-label="Toggle theme"
>
	<SunIcon class="size-[1.1rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
	<MoonIcon
		class="absolute size-[1.1rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
	/>
</Button>
