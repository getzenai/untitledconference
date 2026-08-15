<script lang="ts">
	import { withEmbed } from '$lib/conference/embed';
	import SpeakerAvatar from '$lib/components/app/conference/speaker-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/empty-state.svelte';
	import ScrollEdge from '$lib/components/app/conference/scroll-edge.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		agendaGridColumns,
		occupiedRoomsForDay,
		sessionColumnSpan
	} from '$lib/conference/public-agenda-columns';
	import {
		assignLanes,
		cardDensity,
		floorToLabel,
		laneStyle
	} from '$lib/conference/public-agenda-layout';
	import {
		buildView,
		firstScheduledDayIndex,
		formatFullStamp,
		formatTime,
		type ResolvedSession
	} from '$lib/conference/public-view';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';

	let { data } = $props();

	const view = $derived(buildView(data.conference));

	// Initial tab only — the visitor can still walk to an empty day.
	let dayIndex = $state(untrack(() => firstScheduledDayIndex(buildView(data.conference))));

	// The open session is the URL, not a local flag. Opening it in memory left
	// the browser's Back button with nothing to pop except the previous site.
	const selectedId = $derived(page.url.searchParams.get('session'));
	const selected = $derived(
		selectedId ? (view.sessions.find((s) => s.id === selectedId) ?? null) : null
	);

	function sessionHref(id: string | null) {
		const next = new URL(page.url);
		if (id) next.searchParams.set('session', id);
		else next.searchParams.delete('session');
		return `${next.pathname}${next.search}${next.hash}`;
	}

	function openSession(session: ResolvedSession) {
		void goto(sessionHref(session.id), { keepFocus: true, noScroll: true });
	}

	function closeSession() {
		void goto(sessionHref(null), { keepFocus: true, noScroll: true });
	}

	const day = $derived(view.conference.days[dayIndex]);
	const daySessions = $derived(view.sessionsByDay.get(day.id) ?? []);
	// Columns are the rooms that hold a talk today, not every room the
	// organizer ever created. An empty room is a drop target in the builder;
	// here it is just width a phone has to scroll past (#561).
	const dayRooms = $derived(occupiedRoomsForDay(view.conference.rooms, daySessions));
	const roomColumnIndexes = $derived(
		Array.from({ length: Math.max(dayRooms.length, 1) }, (_, i) => i)
	);

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
		// Down to the previous label boundary: the earliest talk starting at 09:05
		// must not make every line of the gutter read 09:05 / 09:35 / 10:05 (#588).
		const floor = floorToLabel(Math.min(...starts), LABEL_EVERY * SLOT_MINUTES);
		const ceil = Math.max(...ends);
		const rows = Math.ceil((ceil - floor) / (SLOT_MINUTES * 60_000));
		return { floor, ceil, rows };
	});

	// Two talks in one room at one minute are a clash the grid has to show, not
	// hide: they split the column instead of drawing one title over the other.
	const lanes = $derived(assignLanes(daySessions));

	const rowOf = (t: Date) =>
		bounds ? Math.round((t.getTime() - bounds.floor) / (SLOT_MINUTES * 60_000)) + 1 : 1;

	const gutter = $derived.by(() => {
		if (!bounds) return [];
		return Array.from({ length: Math.ceil(bounds.rows / LABEL_EVERY) }, (_, i) => ({
			row: i * LABEL_EVERY + 1,
			label: formatTime(new Date(bounds.floor + i * LABEL_EVERY * SLOT_MINUTES * 60_000))
		}));
	});

	// A session with no room spans every column of *this day* — that is how a
	// plenary or a break is meant to read on a room grid, rather than being
	// dropped for lack of a column to sit in.
	const columnOf = (session: ResolvedSession) => sessionColumnSpan(session, dayRooms);

	// One floor per occupied room column, shared by the heading row and the grid
	// below it.
	//
	// `1fr` alone distributes the space there is, it never asks for more: at 31
	// rooms that left ~1.4rem a column, and a grid that never grows wider than its
	// scroll container never offers a scrollbar either. The floor is the same
	// 9rem the organizer agenda gives a room column (`min-w-36`), so both views
	// read the same at the same room count.
	const COLUMNS = $derived(agendaGridColumns(dayRooms.length));

	const goToDay = (i: number) => {
		dayIndex = i;
		if (selected) closeSession();
	};

	// A deep-linked session belongs to a day. Open that day rather than the
	// grid's default first column, so Back lands on the day the session is on.
	$effect(() => {
		if (!selected) return;
		const i = view.conference.days.findIndex((d) => d.id === selected.dayId);
		if (i >= 0) dayIndex = i;
	});
</script>

<svelte:head>
	<title>Agenda — {view.conference.name}</title>
</svelte:head>

{#if selected}
	{@const session = selected}
	<article>
		<Button variant="ghost" size="sm" class="mb-4 -ml-3" onclick={closeSession}>
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
	<!-- On a phone the day labels are wider than the screen, so the list wraps to one
	     line per day while the two arrows stay vertically centred beside the block —
	     which puts them level with the *middle* day, not the selected one (#392). The
	     arrows then read as controls for a day they do not act on.

	     Below `md` the switcher therefore shows only the selected day: ← day →, one
	     line, nothing to wrap and nothing to point at wrongly. The price is that a
	     phone visitor steps day by day instead of jumping; the tabs come back at the
	     first width where three of them measurably fit on one line. -->
	<div class="mb-6 flex items-center justify-between gap-4" data-testid="agenda-day-switcher">
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
					data-testid={i === dayIndex ? 'agenda-day-selected' : 'agenda-day'}
					onclick={() => goToDay(i)}
					class="rounded-md px-3 py-1.5 text-sm transition-colors {i === dayIndex
						? 'bg-primary text-primary-foreground font-medium'
						: 'text-muted-foreground hover:bg-muted hidden md:block'}"
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
		<!-- Four rooms are 652 px wide and a phone shows 342 of them. Without an edge
		     the grid ends flush and reads as the whole programme, which is the worst
		     kind of wrong: the visitor is not confused, they are confident and mistaken
		     about how many talks run at 11:00 (#393). The fade says more is to the
		     right; the sentence names what is missing, because a shadow is easy to
		     miss in a bright hall (#403). -->
		<ScrollEdge
			data-testid="agenda-room-grid"
			label="Scroll sideways for the other rooms"
			name="rooms"
		>
			<!-- Room headings sit in their own row so the scrollable grid below can
			     keep one clean row-per-half-hour arithmetic.

			     Both grids must keep character-identical column definitions, or the
			     names stop standing over their columns. -->
			<div
				class="text-muted-foreground grid gap-px pb-2 text-xs font-medium"
				style="grid-template-columns: {COLUMNS};"
			>
				<span></span>
				{#each dayRooms as room (room.id)}
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
					{#each roomColumnIndexes as i (i)}
						<span
							class="border-border border-t"
							style="grid-column: {i + 2}; grid-row: {slot.row} / span {LABEL_EVERY};"
						></span>
					{/each}
				{/each}

				<TooltipProvider>
					{#each daySessions as session (session.id)}
						{@const col = columnOf(session)}
						{@const meta = [session.track, session.format].filter(Boolean).join(' · ')}
						{@const density = cardDensity(rowOf(session.end) - rowOf(session.start))}
						{@const lane = laneStyle(lanes.get(session.id))}
						{@const speakers = session.speakers.map((s) => s.name).join(', ')}
						<!--
							min-w-0 + overflow-hidden keep long titles inside narrow room
							columns. Beyond that the card has to fit the height its own length
							bought it: a 30-minute card is 47px and holds two clamped text-sm
							lines at 4px padding, a 15-minute card is 22px and holds one
							smaller line with no padding at all — at text-sm it cut the glyphs
							through the middle (#588). The tooltip and the detail page carry
							title, speakers and time — shadcn Tooltip, not title= (#269). The
							axis stays 1.5rem per quarter hour; we do not grow the row to fit
							the words.
						-->
						<Tooltip>
							<TooltipTrigger>
								{#snippet child({ props })}
									{@const tip = props as { onclick?: (e: MouseEvent) => void }}
									<button
										{...props}
										type="button"
										data-density={density}
										aria-label="{session.title}{speakers
											? `, ${speakers}`
											: ''}. {session.timeRange}{session.room ? ` · ${session.room}` : ''}"
										onclick={(e) => {
											tip.onclick?.(e);
											openSession(session);
										}}
										class="bg-muted/60 hover:bg-muted border-border focus-visible:ring-ring m-px flex min-w-0 flex-col overflow-hidden rounded-md border text-left transition-colors focus-visible:ring-2 focus-visible:outline-none {density ===
										'tiny'
											? 'justify-center px-1 py-0'
											: density === 'compact'
												? 'p-1'
												: 'p-2'}"
										style="grid-column: {col.start} / {col.end}; grid-row: {rowOf(
											session.start
										)} / {rowOf(session.end)};{lane ?? ''}"
									>
										<span
											class="w-full min-w-0 font-medium {density === 'tiny'
												? 'truncate text-[11px] leading-none'
												: density === 'compact'
													? 'line-clamp-2 text-sm leading-tight'
													: 'block text-sm leading-tight break-words'}">{session.title}</span
										>
										{#if meta && density === 'full'}
											<span
												class="text-muted-foreground mt-0.5 block w-full min-w-0 truncate text-xs"
											>
												{meta}
											</span>
										{/if}
									</button>
								{/snippet}
							</TooltipTrigger>
							<TooltipContent side="top" class="max-w-xs">
								<span class="block font-medium">{session.title}</span>
								{#if speakers}
									<span class="mt-0.5 block">{speakers}</span>
								{/if}
								<span class="mt-0.5 block tabular-nums">
									{session.timeRange}{#if session.room}<span class="px-1">·</span
										>{session.room}{/if}
								</span>
							</TooltipContent>
						</Tooltip>
					{/each}
				</TooltipProvider>
			</div>
		</ScrollEdge>
	{/if}
{/if}
