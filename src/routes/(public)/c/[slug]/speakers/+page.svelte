<script lang="ts">
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Input } from '$lib/components/ui/input';
	import { buildView } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

	let query = $state('');

	const visible = $derived(
		view.speakers.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
	);
</script>

<svelte:head>
	<title>Speakers — {view.conference.name}</title>
</svelte:head>

<div class="mb-6 max-w-sm">
	<label for="speaker-search" class="mb-2 block text-sm font-medium">Search speakers</label>
	<Input
		id="speaker-search"
		type="search"
		bind:value={query}
		placeholder="Name"
		autocomplete="off"
	/>
</div>

<p class="text-muted-foreground mb-4 text-sm" aria-live="polite">
	{visible.length} of {view.speakers.length} speakers
</p>

{#if visible.length === 0}
	<p class="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-sm">
		Nobody by that name.
	</p>
{/if}

<!-- Ordered by surname, as the directory convention expects — the sort happens
     once in buildView so this list and the gallery cannot disagree about it. -->
<ul class="divide-border divide-y">
	{#each visible as speaker (speaker.id)}
		<li>
			<a
				href="/c/{view.conference.slug}/speakers/{speaker.id}"
				class="hover:bg-muted/50 -mx-3 flex items-center gap-4 rounded-md px-3 py-4 transition-colors"
			>
				<SpeakerAvatar {speaker} />
				<span class="min-w-0">
					<span class="block font-medium">{speaker.name}</span>
					{#if speaker.jobTitle || speaker.company}
						<span class="text-muted-foreground block text-sm">
							{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
						</span>
					{:else}
						<span class="text-muted-foreground block text-sm italic">Speaker</span>
					{/if}
				</span>
			</a>
		</li>
	{/each}
</ul>
