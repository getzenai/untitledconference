<script lang="ts">
	import { withEmbed } from '$lib/conference/embed';
	import { page } from '$app/state';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/empty-state.svelte';
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
	href={withEmbed(`/c/${view.conference.slug}/speakers`, data.embed)}
	class="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm">← All speakers</a
>

{#if !speaker}
	<EmptyState
		title="No speaker with that address."
		description="The link may be old, or the profile is no longer public."
		action={{ href: `/c/${view.conference.slug}/speakers`, label: 'All speakers →' }}
	/>
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

		{#if speaker.links.length > 0}
			<ul class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
				<!-- Keyed on position, not on the URL: nothing stops a speaker putting the
				     same address in two rows, and a duplicate key throws during hydration
				     and leaves this page blank (#145 was five of these). -->
				{#each speaker.links as link, i (i)}
					<li>
						<!-- `noopener` because these are addresses a speaker typed: the tab
						     they open should not get a handle on this page. -->
						<a
							href={link.url}
							rel="noopener noreferrer nofollow"
							target="_blank"
							class="underline underline-offset-4">{link.label}</a
						>
					</li>
				{/each}
			</ul>
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
