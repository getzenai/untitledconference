<script lang="ts">
	import SpeakerDirectory from '$lib/components/app/conference/speaker-directory.svelte';
	import { buildView } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));
</script>

<svelte:head>
	<title>Speaker gallery — {view.conference.name}</title>
</svelte:head>

<SpeakerDirectory {view} shape="grid" embed={data.embed} />
