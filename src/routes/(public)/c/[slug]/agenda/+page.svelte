<script lang="ts">
	import { withEmbed } from '$lib/conference/embed';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/empty-state.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		buildView,
		formatFullStamp,
		formatTime,
		type ResolvedSession
	} from '$lib/conference/public-view';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

	let dayIndex = $state(0);
	let selected = $state<ResolvedSession | null>(null);

	const day = $derived(view.conference.days[dayIndex]);
	const daySessions = $derived(view.sessionsByDay.get(day.id) ?? []);

	// The grid is built from what the day actually contains, not from a fixed
	// 08:00–18:00 frame: a day with two sessions should not render eight empty
	// hours.
	//
	// Rows are quarter hours, not half hours, because a block's height is a claim
	// about its length: at 30-minute rows a 45-minute keynote rounds up to an hour
	// and appears to run into the next slot. A label every fourth row keeps the
	// gutter readable without coarsening the placement underneath it.
	const SLOT_MINUTES = 15;
	const LABEL_EVERY = 2; // every 30 minutes
	const bounds = $derived.by(() => {
		if (daySessions.length === 0) return null;
		const starts = daySessions.map((s) => s.start.getTime());
		const ends = daySessions.map((s) => s.end.getTime());
		const floor = Math.min(...starts);
		const ceil = Math.max(...ends);
		const rows = Math.ceil((ceil - floor) / (SLOT_MINUTES * 60_000));
		return { floor, ceil, rows };
	});

	const rowOf = (t: Date) =>
		bounds ? Math.round((t.getTime() - bounds.floor) / (SLOT_MINUTES * 60_000)) + 1 : 1;

	const gutter = $derived.by(() => {
		if (!bounds) return [];
		return Array.from({ length: Math.ceil(bounds.rows / LABEL_EVERY) }, (_, i) => ({
			row: i * LABEL_EVERY + 1,
			label: formatTime(new Date(bounds.floor + i * LABEL_EVERY * SLOT_MINUTES * 60_000))
		}));
	});

	// A session with no room spans every column — that is how a plenary or a break
	// is meant to read on a room grid, rather than being dropped for lack of a
	// column to sit in.
	const columnOf = (session: ResolvedSession) => {
		if (!session.roomId) return { start: 2, end: view.conference.rooms.length + 2 };
		const i = view.conference.rooms.findIndex((r) => r.id === session.roomId);
		return { start: i + 2, end: i + 3 };
	};

	// One floor per room column, shared by the heading row and the grid below it.
	//
	// `1fr` alone distributes the space there is, it never asks for more: at 31
	// rooms that left ~1.4rem a column, and a grid that never grows wider than its
	// scroll container never offers a scrollbar either. The floor is the same
	// 9rem the organizer agenda gives a room column (`min-w-36`), so both views
	// read the same at the same room count.
	const ROOM_MIN = '9rem';
	const COLUMNS = $derived(
		`4.5rem repeat(${view.conference.rooms.length}, minmax(${ROOM_MIN}, 1fr))`
	);

	const goToDay = (i: number) => {
		dayIndex = i;
		selected = null;
	};
</script>

<svelte:head>
	<title>Agenda — {view.conference.name}</title>
</svelte:head>

{#if selected}
	{@const session = selected}
	<article>
		<Button variant="ghost" size="sm" class="mb-4 -ml-3" onclick={() => (selected = null)}>
			← Back to agenda
		</Button>

		<div class="flex flex-wrap items-center gap-2">
			{#if session.track}<Badge variant="secondary">{session.track}</Badge>{/if}
			{#if session.format}<Badge variant="outline">{session.format}</Badge>{/if}
		</div>

		<h2 class="mt-2 text-2xl leading-tight font-semibold">{session.title}</h2>

		<p class="text-muted-foreground mt-2 text-sm">
			{formatFullStamp(session)}{#if session.room}<span class="px-1.5">·</span>{session.room}{/if}
		</p>

		{#if session.recordingUrl}
			<!-- Above the abstract on purpose: after the conference this is what the page
			     is for. Before it, the block does not exist at all. -->
			<p class="mt-5">
				<Button href={session.recordingUrl} rel="noopener" target="_blank">Watch recording</Button>
			</p>
		{/if}

		<p class="mt-5 max-w-2xl text-sm leading-relaxed">{session.description}</p>

		<ul class="mt-6 flex flex-wrap gap-x-6 gap-y-3">
			{#each session.speakers as speaker (speaker.id)}
				<li class="flex items-center gap-2.5">
					<SpeakerAvatar {speaker} size="sm" />
					<span class="text-sm leading-tight">
						<a
							href={withEmbed(`/c/${view.conference.slug}/speakers/${speaker.id}`, data.embed)}
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
	</article>
{:else}
	<div class="mb-6 flex items-center justify-between gap-4">
		<Button
			variant="outline"
			size="sm"
			disabled={dayIndex === 0}
			onclick={() => goToDay(dayIndex - 1)}
			aria-label="Previous day">←</Button
		>

		<div role="tablist" aria-label="Conference days" class="flex flex-wrap justify-center gap-2">
			{#each view.conference.days as d, i (d.id)}
				<button
					type="button"
					role="tab"
					aria-selected={i === dayIndex}
					onclick={() => goToDay(i)}
					class="rounded-md px-3 py-1.5 text-sm transition-colors {i === dayIndex
						? 'bg-primary text-primary-foreground font-medium'
						: 'text-muted-foreground hover:bg-muted'}"
				>
					{d.label}
				</button>
			{/each}
		</div>

		<Button
			variant="outline"
			size="sm"
			disabled={dayIndex === view.conference.days.length - 1}
			onclick={() => goToDay(dayIndex + 1)}
			aria-label="Next day">→</Button
		>
	</div>

	{#if !bounds}
		<EmptyState
			title="Nothing is scheduled on this day yet."
			description="The programme is still being built. The session list already has everything that has been accepted."
			action={{ href: `/c/${view.conference.slug}`, label: 'Browse all sessions →' }}
		/>
	{:else}
		<div class="overflow-x-auto">
			<!-- Room headings sit in their own row so the scrollable grid below can
			     keep one clean row-per-half-hour arithmetic.

			     Both grids must keep character-identical column definitions, or the
			     names stop standing over their columns. -->
			<div
				class="text-muted-foreground grid gap-px pb-2 text-xs font-medium"
				style="grid-template-columns: {COLUMNS};"
			>
				<span></span>
				{#each view.conference.rooms as room (room.id)}
					<span class="px-2">{room.name}</span>
				{/each}
			</div>

			<div
				class="grid gap-px"
				style="grid-template-columns: {COLUMNS}; grid-template-rows: repeat({bounds.rows}, 1.5rem);"
			>
				{#each gutter as slot (slot.row)}
					<span
						class="text-muted-foreground border-border border-t pt-1 text-xs tabular-nums"
						style="grid-column: 1; grid-row: {slot.row} / span {LABEL_EVERY};">{slot.label}</span
					>
					{#each view.conference.rooms as room, i (room.id)}
						<span
							class="border-border border-t"
							style="grid-column: {i + 2}; grid-row: {slot.row} / span {LABEL_EVERY};"
						></span>
					{/each}
				{/each}

				{#each daySessions as session (session.id)}
					{@const col = columnOf(session)}
					{@const meta = [session.track, session.format].filter(Boolean).join(' · ')}
					<!--
						min-w-0 + overflow-hidden keep long titles inside narrow room
						columns; title= exposes the full string when the card clips.
					-->
					<button
						type="button"
						onclick={() => (selected = session)}
						class="bg-muted/60 hover:bg-muted border-border focus-visible:ring-ring m-px flex min-w-0 flex-col overflow-hidden rounded-md border p-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
						style="grid-column: {col.start} / {col.end}; grid-row: {rowOf(session.start)} / {rowOf(
							session.end
						)};"
						title={session.title}
					>
						<span class="block w-full min-w-0 text-sm leading-tight font-medium break-words"
							>{session.title}</span
						>
						{#if meta}
							<span class="text-muted-foreground mt-0.5 block w-full min-w-0 truncate text-xs">
								{meta}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
{/if}
