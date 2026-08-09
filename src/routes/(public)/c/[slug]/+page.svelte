<script lang="ts">
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import ShowMore from '$lib/components/app/conference/show-more.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { SvelteSet } from 'svelte/reactivity';
	import { buildView, formatFullStamp, matchesQuery } from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

	let query = $state('');
	// Facets are sets, not single values: "Platform or Craft" is the question an
	// attendee actually has. An empty set means "no opinion", which is why the
	// filter reads as `size === 0 || has(...)` rather than defaulting to all ids.
	const tracks = new SvelteSet<string>();
	const formats = new SvelteSet<string>();
	const rooms = new SvelteSet<string>();

	const toggle = (set: SvelteSet<string>, id: string) => {
		if (set.has(id)) set.delete(id);
		else set.add(id);
	};

	const visible = $derived(
		view.sessions.filter(
			(s) =>
				matchesQuery(s, query) &&
				(tracks.size === 0 || (s.trackId !== null && tracks.has(s.trackId))) &&
				(formats.size === 0 || (s.formatId !== null && formats.has(s.formatId))) &&
				(rooms.size === 0 || (s.roomId !== null && rooms.has(s.roomId)))
		)
	);

	const filtered = $derived(
		query.trim() !== '' || tracks.size > 0 || formats.size > 0 || rooms.size > 0
	);

	const clearAll = () => {
		query = '';
		tracks.clear();
		formats.clear();
		rooms.clear();
	};

	const facets = $derived([
		{
			label: 'Track',
			options: view.conference.tracks,
			selected: tracks
		},
		{
			label: 'Format',
			options: view.conference.formats,
			selected: formats
		},
		{
			label: 'Location',
			options: view.conference.rooms,
			selected: rooms
		}
	]);
</script>

<svelte:head>
	<title>Sessions — {view.conference.name}</title>
</svelte:head>

<div class="grid gap-8 md:grid-cols-[13rem_1fr]">
	<aside class="space-y-6">
		<div>
			<label for="session-search" class="mb-2 block text-sm font-medium">Search</label>
			<Input
				id="session-search"
				type="search"
				bind:value={query}
				placeholder="Session or speaker"
				autocomplete="off"
			/>
		</div>

		{#each facets as facet (facet.label)}
			<fieldset class="border-0 p-0">
				<legend class="mb-2 text-sm font-medium">{facet.label}</legend>
				<ul class="space-y-1.5">
					{#each facet.options as option (option.id)}
						<li>
							<label class="flex cursor-pointer items-center gap-2 text-sm">
								<Checkbox
									checked={facet.selected.has(option.id)}
									onCheckedChange={() => toggle(facet.selected, option.id)}
								/>
								<span class="text-muted-foreground">{option.name}</span>
							</label>
						</li>
					{/each}
				</ul>
			</fieldset>
		{/each}

		{#if filtered}
			<button
				type="button"
				onclick={clearAll}
				class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
			>
				Clear filters
			</button>
		{/if}
	</aside>

	<section>
		<p class="text-muted-foreground mb-4 text-sm" aria-live="polite">
			{visible.length} of {view.sessions.length} sessions
		</p>

		{#if visible.length === 0}
			<EmptyState
				title="No session matches that."
				description="Try a shorter search, or drop one of the filters."
			>
				{#if filtered}
					<Button variant="outline" size="sm" class="mt-1" onclick={clearAll}>
						Clear all filters
					</Button>
				{/if}
			</EmptyState>
		{/if}

		<ul class="space-y-4">
			{#each visible as session (session.id)}
				<li class="border-border rounded-lg border p-5">
					<div class="flex flex-wrap items-center gap-2">
						{#if session.track}<Badge variant="secondary">{session.track}</Badge>{/if}
						{#if session.format}<Badge variant="outline">{session.format}</Badge>{/if}
					</div>

					<h2 class="mt-2 text-lg leading-snug font-semibold">{session.title}</h2>

					<p class="text-muted-foreground mt-1 text-sm">
						{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span
							>{session.room}{/if}
					</p>

					{#if session.recordingUrl}
						<p class="mt-3">
							<Button
								href={session.recordingUrl}
								rel="noopener"
								target="_blank"
								variant="outline"
								size="sm"
							>
								Watch recording
							</Button>
						</p>
					{/if}

					<ShowMore text={session.description} class="mt-3" />

					<ul class="mt-4 flex flex-wrap gap-x-6 gap-y-3">
						{#each session.speakers as speaker (speaker.id)}
							<li class="flex items-center gap-2.5">
								<SpeakerAvatar {speaker} size="sm" />
								<span class="text-sm leading-tight">
									<a
										href="/c/{view.conference.slug}/speakers/{speaker.id}"
										class="font-medium hover:underline">{speaker.name}</a
									>
									{#if speaker.jobTitle || speaker.company}
										<span class="text-muted-foreground block text-xs">
											{[speaker.jobTitle, speaker.company].filter(Boolean).join(', ')}
										</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</section>
</div>
