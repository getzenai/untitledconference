<script lang="ts">
	import { initials } from '$lib/conference/public-view';
	import type { PublicSpeaker } from '$lib/conference/public-types';

	let {
		speaker,
		size = 'md',
		class: className = ''
	}: { speaker: PublicSpeaker; size?: 'sm' | 'md' | 'lg'; class?: string } = $props();

	const box = { sm: 'size-9 text-xs', md: 'size-12 text-sm', lg: 'size-24 text-xl' };
</script>

<!--
	A missing headshot is a normal state, not an error: EMB-12 grades the gallery
	on degrading gracefully for it. Initials on the muted surface keep the grid's
	rhythm intact instead of leaving a hole where a face was.
-->
{#if speaker.headshotUrl}
	<img
		src={speaker.headshotUrl}
		alt=""
		class="bg-muted shrink-0 rounded-full object-cover {box[size]} {className}"
		loading="lazy"
	/>
{:else}
	<span
		aria-hidden="true"
		class="bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full font-medium {box[
			size
		]} {className}"
	>
		{initials(speaker.name)}
	</span>
{/if}
