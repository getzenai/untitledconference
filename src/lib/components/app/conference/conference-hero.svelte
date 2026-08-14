<script lang="ts">
	/**
	 * The front of the public site: what the event is, when and where it happens,
	 * who is speaking, and the two things a visitor came to do.
	 *
	 * It replaces the plain identity row on the index only. Every other surface
	 * keeps the compact header, because a viewport-tall banner above the agenda
	 * would push the thing the visitor navigated to below the fold.
	 */
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { ConferenceView } from '$lib/conference/public-view';

	// No `embed` prop: the hero is a title page, and a host site that framed the
	// session widget asked for the sessions. The index leaves it out inside an
	// embed, so there is no embedded link here to keep the flag on.
	let {
		view,
		dateRange,
		callIsOpen
	}: {
		view: ConferenceView;
		/** Null while the conference has no dates — the line comes off entirely. */
		dateRange: string | null;
		callIsOpen: boolean;
	} = $props();

	const conference = $derived(view.conference);
	const base = $derived(`/c/${conference.slug}`);

	// Faces first, initials only to fill the row out. The strip is a claim that
	// real people are speaking here, and five monograms make the opposite claim.
	const faces = $derived(
		[...view.speakers]
			.sort((a, b) => Number(Boolean(b.headshotUrl)) - Number(Boolean(a.headshotUrl)))
			.slice(0, 5)
	);

	// Only counts the visitor can verify by clicking through, and only the ones
	// that say something: a zero is an admission the surface behind it is empty,
	// so an unscheduled conference shows three numbers rather than a row of noughts.
	const stats = $derived(
		[
			{ label: 'Sessions', value: view.sessions.length },
			{ label: 'Speakers', value: view.speakers.length },
			{ label: 'Days', value: conference.days.length },
			{ label: 'Rooms', value: conference.rooms.length }
		].filter((stat) => stat.value > 0)
	);
</script>

<div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
	<div>
		{#if callIsOpen}
			<Badge variant="secondary">Call for papers open</Badge>
		{/if}

		<h1 class="mt-4 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
			{conference.name}
		</h1>

		<!-- The whole line goes when neither half has anything to say: an empty
		     paragraph under the title reads as a loading state that never ends. -->
		{#if dateRange || conference.venue}
			<p class="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
				{#if dateRange}
					<span class="flex items-center gap-2">
						<CalendarIcon class="size-4 shrink-0" aria-hidden="true" />{dateRange}
					</span>
				{/if}
				{#if conference.venue}
					<span class="flex items-center gap-2">
						<MapPinIcon class="size-4 shrink-0" aria-hidden="true" />{conference.venue}
					</span>
				{/if}
			</p>
		{/if}

		<div class="mt-8 flex flex-wrap gap-3">
			<Button href={`${base}/agenda`}>See the agenda</Button>
			{#if callIsOpen}
				<Button variant="outline" href={`${base}/cfp`}>Submit a proposal</Button>
			{/if}
		</div>
	</div>

	{#if faces.length > 0}
		<a
			href={`${base}/speakers`}
			class="hover:bg-muted/50 -m-3 flex items-center gap-4 rounded-lg p-3 transition-colors"
		>
			<!-- Overlapped, with a ring in the page background colour so the faces
			     read as one group rather than as five separate avatars. -->
			<span class="flex -space-x-3">
				{#each faces as speaker (speaker.id)}
					<SpeakerAvatar {speaker} class="ring-background ring-2" />
				{/each}
			</span>
			<span class="text-sm leading-tight">
				<span class="block font-medium">{view.speakers.length} speakers</span>
				<span class="text-muted-foreground block text-xs">Meet the line-up →</span>
			</span>
		</a>
	{/if}
</div>

{#if stats.length > 0}
	<dl class="border-border mt-12 grid grid-cols-2 gap-8 border-t pt-8 sm:grid-cols-4">
		{#each stats as stat (stat.label)}
			<div>
				<dt class="text-muted-foreground text-sm">{stat.label}</dt>
				<dd class="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
			</div>
		{/each}
	</dl>
{/if}
