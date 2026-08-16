<script lang="ts">
	import { withEmbed } from '$lib/conference/embed';
	import ConferenceHero from '$lib/components/app/conference/conference-hero.svelte';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import ShowMore from '$lib/components/app/conference/show-more.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import {
		EMPTY_SESSION_FILTERS,
		hasSessionFilters,
		readSessionFilters,
		sessionFiltersHref,
		toggleFacetValue,
		type SessionFilters
	} from '$lib/conference/session-filters';
	import {
		buildView,
		formatDateRange,
		formatFullStamp,
		matchesQuery
	} from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

	// The filters are the URL, not component state (#751). Held in memory, a
	// narrowed list was not a link and did not survive a reload — and the same
	// address showed different content depending on something invisible, which
	// CLAUDE.md says a route must never do. The agenda already works this way
	// with `?session=`.
	//
	// Facets stay multi-valued: "Platform or Craft" is the question an attendee
	// actually has, so an empty list means "no opinion" rather than "none".
	const filters = $derived(readSessionFilters(page.url.searchParams));
	const query = $derived(filters.q);

	/**
	 * `replaceState` from `$app/navigation`, not `goto(…, { replaceState: true })`.
	 *
	 * Because Back should step *out* of the page rather than walk backwards
	 * through every keystroke. Shallow routing changes the address without
	 * starting a navigation at all, which is what a filter wants.
	 *
	 * Not for the reason it is tempting to give: `goto` would *not* re-run the
	 * server load. SvelteKit tracks the individual search params a load reads,
	 * and `+layout.server.ts` reads only `embed` — changing `q` does not
	 * invalidate it.
	 */
	function applyFilters(next: SessionFilters) {
		replaceState(sessionFiltersHref(page.url, next), page.state);
	}

	const setQuery = (q: string) => applyFilters({ ...filters, q });

	type FacetKey = 'tracks' | 'formats' | 'rooms';
	const toggle = (key: FacetKey, id: string) =>
		applyFilters({ ...filters, [key]: toggleFacetValue(filters[key], id) });

	const visible = $derived(
		view.sessions.filter(
			(s) =>
				matchesQuery(s, filters.q) &&
				(filters.tracks.length === 0 ||
					(s.trackId !== null && filters.tracks.includes(s.trackId))) &&
				(filters.formats.length === 0 ||
					(s.formatId !== null && filters.formats.includes(s.formatId))) &&
				(filters.rooms.length === 0 || (s.roomId !== null && filters.rooms.includes(s.roomId)))
		)
	);

	const filtered = $derived(hasSessionFilters(filters));

	const clearAll = () => applyFilters(EMPTY_SESSION_FILTERS);

	const facets = $derived([
		{
			label: 'Track',
			options: view.conference.tracks,
			key: 'tracks' as FacetKey,
			selected: filters.tracks
		},
		{
			label: 'Format',
			options: view.conference.formats,
			key: 'formats' as FacetKey,
			selected: filters.formats
		},
		{
			label: 'Location',
			options: view.conference.rooms,
			key: 'rooms' as FacetKey,
			selected: filters.rooms
		}
	]);
</script>

<svelte:head>
	<title>Sessions — {view.conference.name}</title>
</svelte:head>

<!--
	The hero is a head zone above the existing list, not a separate landing page:
	`/c/<slug>` is the address in every share link, every embed snippet and every
	E2E spec, and moving the session list off it to make room would cost all three
	for nothing a visitor can see.

	It comes off inside an embed. A host site that framed the session widget asked
	for the sessions, not for our title page in their column.
-->
{#if !data.embed}
	<div class="border-border mb-12 border-b pb-12">
		<ConferenceHero
			{view}
			dateRange={formatDateRange(view.conference)}
			callIsOpen={data.call?.state === 'open'}
		/>
	</div>
{/if}

<!--
	The list first, the filters after it — in the DOM, not only on screen. On a phone
	the two stack in source order, and the old order put four fieldsets between the
	visitor and the first session title. Screen readers walk the same order.
-->
<div class="grid gap-8 md:grid-cols-[1fr_13rem]">
	<section>
		<div class="mb-4 flex items-baseline justify-between gap-4">
			<p class="text-muted-foreground text-sm" aria-live="polite">
				{visible.length} of {view.sessions.length} sessions
			</p>
			<!--
				Below `md` the two stack, so the filters now sit under the list — past
				thirty sessions on a phone that is out of reach. One link back down to
				them costs nothing and keeps the DOM order honest; no `order-*` trick,
				so focus and screen-reader order stay what the markup says.
			-->
			<a href="#session-filters" class="text-sm underline underline-offset-4 md:hidden">
				Search and filter
			</a>
		</div>

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
										href={withEmbed(
											`/c/${view.conference.slug}/speakers/${speaker.id}`,
											data.embed
										)}
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

	<aside id="session-filters" class="scroll-mt-4 space-y-6">
		<div>
			<label for="session-search" class="mb-2 block text-sm font-medium">Search</label>
			<Input
				id="session-search"
				type="search"
				value={query}
				oninput={(event) => setQuery(event.currentTarget.value)}
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
									checked={facet.selected.includes(option.id)}
									onCheckedChange={() => toggle(facet.key, option.id)}
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
</div>
