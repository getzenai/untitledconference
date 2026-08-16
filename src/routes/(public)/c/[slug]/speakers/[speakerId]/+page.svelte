<script lang="ts">
	import { withEmbed } from '$lib/conference/embed';
	import { page } from '$app/state';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { buildView, formatFullStamp } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));
	const speaker = $derived(view.speakersById.get(page.params.speakerId ?? ''));
	const sessions = $derived(speaker ? (view.sessionsBySpeaker.get(speaker.id) ?? []) : []);
	// The loader already excludes this conference and drops speakers it cannot
	// resolve, so an empty array here means "spoke nowhere else" — not "unknown".
	const elsewhere = $derived(data.appearances);
</script>

<!-- The reason this page exists after the talk is over. Rendered as a link
     rather than a plain URL because the visitor came here from a speaker's name,
     not from a URL bar; absent entirely before the talk has been given, so a
     speaker with no recordings reads as quiet rather than broken. -->
{#snippet recording(url: string | null)}
	{#if url}
		<p class="mt-3">
			<Button href={url} rel="noopener" target="_blank" size="sm" variant="secondary">
				Watch recording
			</Button>
		</p>
	{/if}
{/snippet}

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
					<a
						href={withEmbed(`/c/${view.conference.slug}/agenda?session=${session.id}`, data.embed)}
						class="mt-2 block font-medium hover:underline">{session.title}</a
					>
					<p class="text-muted-foreground mt-1 text-sm">
						{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
							>{session.room}{/if}
					</p>
					{@render recording(session.recordingUrl)}
				</li>
			{/each}
		</ul>

		{#if elsewhere.length > 0}
			<!-- One `speaker_profile` row is carried from event to event by
			     `conference_speaker`, so the same person genuinely has a history here.
			     It is the half of this page the agenda can never show: the agenda knows
			     about one conference by construction. -->
			<h3 class="mt-10 text-sm font-medium">Also spoke at</h3>
			{#each elsewhere as event (event.conferenceSlug)}
				<section class="mt-4">
					<a
						href={withEmbed(`/c/${event.conferenceSlug}`, data.embed)}
						class="text-sm font-medium hover:underline">{event.conferenceName}</a
					>
					<ul class="divide-border mt-1 divide-y">
						{#each event.sessions as session (session.id)}
							<li class="py-4">
								<!-- Other-conference ids do not belong on this page's ?session=; the grid is the right landing. -->
								<a
									href={withEmbed(`/c/${event.conferenceSlug}/agenda`, data.embed)}
									class="font-medium hover:underline">{session.title}</a
								>
								<p class="text-muted-foreground mt-1 text-sm">
									{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
										>{session.room}{/if}
								</p>
								{@render recording(session.recordingUrl)}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		{/if}
	</article>
{/if}
