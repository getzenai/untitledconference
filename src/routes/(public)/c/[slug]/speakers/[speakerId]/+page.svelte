<script lang="ts">
	import { page } from '$app/state';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buildView, formatFullStamp } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));
	const speaker = $derived(view.speakersById.get(page.params.speakerId ?? ''));
	const sessions = $derived(speaker ? (view.sessionsBySpeaker.get(speaker.id) ?? []) : []);
</script>

<svelte:head>
	<title>{speaker?.name ?? 'Speaker'} — {view.conference.name}</title>
</svelte:head>

<a
	href="/c/{view.conference.slug}/speakers"
	class="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm">← All speakers</a
>

{#if !speaker}
	<p class="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-sm">
		No speaker with that address.
	</p>
{:else}
	<article class="max-w-2xl">
		<div class="flex items-start gap-5">
			<SpeakerAvatar {speaker} size="lg" />
			<div class="pt-1">
				<h2 class="text-2xl leading-tight font-semibold">{speaker.name}</h2>
				{#if speaker.jobTitle || speaker.company}
					<p class="text-muted-foreground mt-1 text-sm">
						{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
					</p>
				{/if}
			</div>
		</div>

		{#if speaker.bio}
			<p class="mt-6 text-sm leading-relaxed">{speaker.bio}</p>
		{/if}

		<h3 class="mt-8 text-sm font-medium">
			{sessions.length === 1 ? 'Session' : 'Sessions'}
		</h3>
		<ul class="divide-border mt-2 divide-y">
			{#each sessions as session (session.id)}
				<li class="py-4">
					<div class="flex flex-wrap items-center gap-2">
						{#if session.track}<Badge variant="secondary">{session.track}</Badge>{/if}
						{#if session.format}<Badge variant="outline">{session.format}</Badge>{/if}
					</div>
					<p class="mt-2 font-medium">{session.title}</p>
					<p class="text-muted-foreground mt-1 text-sm">
						{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
							>{session.room}{/if}
					</p>
				</li>
			{/each}
		</ul>
	</article>
{/if}
