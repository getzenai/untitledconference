<script lang="ts">
	/**
	 * The agenda builder — journey 2, step 8.
	 *
	 * The grid is a calendar: rooms are columns, quarter hours are rows, and a
	 * block's height is its length. That is the shape the public agenda page has
	 * always had, and the shape an organizer already knows from every other
	 * calendar. The room-card list it replaced was readable but flat — every talk
	 * looked the same size, so the one question this screen exists to answer, does
	 * this fit next to that, could not be answered by looking.
	 *
	 * Sessions are dragged between slots and out of the tray. Drag is the human
	 * path and it is the only thing here that needs JavaScript, so it is built
	 * strictly on top of the click path rather than replacing it:
	 *
	 *  - Every slot opens the slot editor on click, and every room keeps its
	 *    "Open a slot" button — that is the keyboard route, the no-JS route, and
	 *    the route the eval harness drives.
	 *  - A drop posts `?/place`, the same action the editor's form posts. There is
	 *    no write path that only exists for the mouse.
	 *
	 * Two things deliberately cannot be dragged. Breaks span every room, so
	 * dropping one into a column would file lunch under Hall 1. And a drop onto a
	 * taken slot is not a swap: `placeSession` is permissive about conflicts, so it
	 * would double-book rather than trade. Both stay with the editor, which asks
	 * which of the two you meant.
	 */
	import { enhance } from '$lib/forms/enhance';
	import { tick } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Popover from '$lib/components/ui/popover';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { blockRows, gridSlots, laneLayout, type GridFrame } from '$lib/conference/agenda-grid';
	import { formUpdateOptions } from '$lib/conference/form-reset';
	import { formatDayLong } from '$lib/conference/public-view';
	import { DragController } from './drag-controller.svelte';
	import SlotEditor from './SlotEditor.svelte';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const board = $derived(data.board);

	let busy = $state(false);
	/** Which day the grid is showing. Days are tabs, not one endless column. */
	let activeDay = $state(0);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
			} finally {
				busy = false;
			}
		};
	};

	const day = $derived(board.days[activeDay] ?? board.days[0]);

	/**
	 * The clashes a given session is part of, so a block can show its own.
	 *
	 * Filtered per block rather than indexed once: a conference has a handful of
	 * conflicts at most, and an index would be a mutable Map inside a derived — more
	 * machinery than the problem has.
	 */
	const clashesFor = (placementId: number) =>
		board.conflicts.filter((c) => c.placementIds.includes(placementId)).map((c) => c.detail);

	const daySessions = $derived(board.placed.filter((p) => p.dayId === day?.id));

	const timeLabel = (minutes: number | null) => {
		if (minutes === null) return '';
		return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
	};

	const byStart = (a: { startMinutes: number | null }, b: { startMinutes: number | null }) =>
		(a.startMinutes ?? 0) - (b.startMinutes ?? 0);

	const sessionsIn = (roomId: number) =>
		daySessions.filter((s) => s.roomId === roomId).sort(byStart);

	/**
	 * Breaks that span every room. They have no room column to sit in, so they get
	 * their own strip above the grid — otherwise lunch is invisible on the one screen
	 * where an organizer is deciding what fits around it.
	 */
	const dayBreaks = $derived(daySessions.filter((s) => s.roomId === null).sort(byStart));

	/**
	 * Twenty rooms is twenty columns, and the one you are looking at is somewhere
	 * off the right edge. Narrowing to a single room is the cheap way out; it is a
	 * view filter only — the slot editor's room select keeps offering every room,
	 * so nothing becomes unreachable by hiding it.
	 */
	const ROOM_FILTER_FROM = 6;
	/**
	 * Which rooms are columns, as a view filter. Nothing picked means keep every
	 * room — that is what "All N rooms" on the trigger says — and picking any
	 * subset narrows the grid to just those. Reassigning the array, never
	 * mutating it, keeps the derived honest.
	 */
	let selectedRooms = $state<number[]>([]);
	const visibleRooms = $derived(
		selectedRooms.length === 0
			? board.rooms
			: board.rooms.filter((r) => selectedRooms.includes(r.id))
	);
	const filterLabel = $derived(
		selectedRooms.length === 0
			? `All ${board.rooms.length} rooms`
			: `${selectedRooms.length} of ${board.rooms.length} rooms`
	);
	const toggleRoom = (id: number) => {
		selectedRooms = selectedRooms.includes(id)
			? selectedRooms.filter((r) => r !== id)
			: [...selectedRooms, id];
	};

	const unscheduled = $derived(board.tray.length);
	const autoPlaceHint = $derived(
		unscheduled === 1
			? 'Places the waiting talk into free slots. Nothing already on the grid moves.'
			: `Places the ${unscheduled} waiting talks into free slots. Nothing already on the grid moves.`
	);
	// Talks, not breaks. The public loader (`selectPublishedPlacements`) requires
	// three things: placement confirmed, submission accepted, content approved.
	// The board carries the first two (`status`, `submissionStatus`). Content
	// approval is not on the board — it defaults to approved and nobody writes
	// it — so a count of the two we know is the honest match, not a complete
	// copy of the query. A declined talk keeps its confirmed slot on purpose
	// (a human has to resolve it); counting it as live was #497 with the sign
	// flipped.
	const placedTalks = $derived(board.placed.filter((p) => p.submissionId !== null));
	const liveTalks = $derived(
		placedTalks.filter((p) => p.status === 'confirmed' && p.submissionStatus === 'accepted')
	);
	/**
	 * What the button toggles, which is not what the public sees.
	 *
	 * `?/publish` sets every placement to `confirmed` and back to `tentative`; it
	 * knows nothing about acceptance. Reading the label off `liveTalks` instead
	 * meant a declined talk in a confirmed slot — the case that keeps its slot on
	 * purpose, two comments up — made the label read "Publish the agenda" for
	 * ever, and the way to take the programme down disappeared while the public
	 * was still being served the other sessions. So the label follows the state
	 * the action owns, and the sentence above it keeps the public truth, which is
	 * the one thing a two-state button could never say ("1 of 2").
	 */
	const everythingPublished = $derived(
		placedTalks.length > 0 && placedTalks.every((p) => p.status === 'confirmed')
	);
	const publicState = $derived(
		placedTalks.length === 0
			? null
			: liveTalks.length === 0
				? 'The public cannot see these slots yet.'
				: liveTalks.length === placedTalks.length
					? `The public agenda shows ${liveTalks.length} ${liveTalks.length === 1 ? 'session' : 'sessions'}.`
					: `The public agenda shows ${liveTalks.length} of ${placedTalks.length} sessions.`
	);

	/**
	 * The frame: which rooms are columns, which minutes are rows.
	 *
	 * `gridSlots` widens past the working day for anything already placed outside
	 * it, so a seeded 08:00 keynote has a row rather than quietly not being drawn.
	 * Both halves of the screen read this one object — the rows the grid paints and
	 * the slot a drop lands in — so they cannot drift apart.
	 */
	const SLOT_MINUTES = 15;
	const ROW_REM = 1.5;
	/** A time label every second row, i.e. every half hour, as on the public page. */
	const LABEL_EVERY = 2;

	const frame = $derived<GridFrame>({
		rooms: visibleRooms.map((r) => r.id),
		slots: gridSlots({
			dayStartsAt: data.slots[0]?.minutes ?? 9 * 60,
			dayEndsAt: (data.slots.at(-1)?.minutes ?? 17 * 60 + 45) + SLOT_MINUTES,
			slotMinutes: SLOT_MINUTES,
			sessions: daySessions.filter((s) => s.roomId !== null)
		}),
		slotMinutes: SLOT_MINUTES
	});

	const gridHeight = $derived(`${frame.slots.length * ROW_REM}rem`);

	const gutter = $derived(
		frame.slots
			.map((minutes, i) => ({ minutes, i }))
			.filter(({ i }) => i % LABEL_EVERY === 0)
			.map(({ minutes, i }) => ({ minutes, top: `${i * ROW_REM}rem` }))
	);

	/**
	 * Which slot the editor is open on, or null for closed. `SlotEditor.svelte`
	 * holds the dialog itself and the reasoning behind its two shapes.
	 *
	 * It is instantiated only while `editing` is set, rather than rendered and
	 * hidden: a dialog that is always in the DOM is one a test can assert against
	 * without ever having opened it.
	 */
	type SlotTarget = { roomId: number; roomName: string; startMinutes: number };
	let editing = $state<SlotTarget | null>(null);

	/**
	 * What starts in a slot — not what covers it.
	 *
	 * A 30-minute talk at 10:00 leaves 10:15 free by this definition even though
	 * it runs through it, and that is on purpose: overlapping placements are how
	 * a room clash arises at all (AIA-05), and greying out covered slots would
	 * close the only path an agent has to produce one.
	 */
	const startingAt = (roomId: number, startMinutes: number) =>
		daySessions.find((s) => s.roomId === roomId && s.startMinutes === startMinutes) ?? null;

	const occupant = $derived(editing ? startingAt(editing.roomId, editing.startMinutes) : null);

	/**
	 * Who the occupant may trade places with: the rest of this day's grid.
	 *
	 * Breaks are left out even though the swap itself would accept them. A break has
	 * no room — it spans all of them — so trading a talk into one would take the talk
	 * off the room grid entirely and file it under lunch. Other days are left out too:
	 * the organizer is looking at one day, and a list of everything would be a list
	 * nobody reads.
	 */
	const swapWith = $derived(
		occupant
			? daySessions
					.filter((s) => s.roomId !== null && s.placementId !== occupant.placementId)
					.sort(byStart)
					.map((s) => ({
						placementId: s.placementId,
						title: s.title,
						startMinutes: s.startMinutes,
						roomName: board.rooms.find((r) => r.id === s.roomId)?.name ?? ''
					}))
			: []
	);

	const openSlot = (room: { id: number; name: string }, startMinutes: number) => {
		editing = { roomId: room.id, roomName: room.name, startMinutes };
	};

	const closeSlot = () => {
		editing = null;
	};

	/** Close on a successful write, so the grid behind the dialog is the answer. */
	const submittingSlot = () => {
		busy = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			try {
				await update(formUpdateOptions('edit'));
				closeSlot();
			} finally {
				busy = false;
			}
		};
	};

	/* ---------------------------------------------------------------- dragging */

	/**
	 * The gesture itself lives in `drag-controller.svelte.ts`. What stays here is
	 * everything that needs the DOM or the board: where the columns are on screen,
	 * what already sits in a slot, and the form a drop posts.
	 */
	let gridEl = $state<HTMLElement | null>(null);
	let placeForm = $state<HTMLFormElement | null>(null);
	let pending = $state<{ placementId: number; roomId: number; startMinutes: number } | null>(null);

	const drag = new DragController({
		frame: () => frame,
		columnsBox: () => {
			const bodies = gridEl?.querySelectorAll('[data-column-body]');
			if (!bodies || bodies.length === 0) return null;

			const first = bodies[0].getBoundingClientRect();
			const last = bodies[bodies.length - 1].getBoundingClientRect();
			return {
				left: first.left,
				top: first.top,
				width: last.right - first.left,
				height: first.height
			};
		},
		occupantAt: (slot) => startingAt(slot.roomId, slot.startMinutes),
		openSlot: (slot) => {
			const room = board.rooms.find((r) => r.id === slot.roomId);
			if (room) openSlot(room, slot.startMinutes);
		},
		place: async (placementId, slot) => {
			if (!day) return;
			pending = { placementId, roomId: slot.roomId, startMinutes: slot.startMinutes };
			await tick();
			placeForm?.requestSubmit();
		}
	});

	/** A drag that ended on the grid still fires a click; that click is not a slot click. */
	function slotClicked(room: { id: number; name: string }, startMinutes: number) {
		if (drag.moved) return;
		openSlot(room, startMinutes);
	}
</script>

<svelte:window
	onpointermove={drag.move}
	onpointerup={drag.end}
	onpointercancel={drag.cancel}
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		// An open app-select listbox eats Escape on document and marks it handled.
		// A native <select> swallowed the key outright; without this guard closing
		// the room list would close the whole slot editor behind it.
		if (e.defaultPrevented) return;
		if (drag.dragging) drag.cancel();
		else closeSlot();
	}}
/>

<svelte:head>
	<title>Agenda — {data.conference.name}</title>
</svelte:head>

<div class="border-border bg-card border-b px-6 py-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Agenda</h1>
			<p class="text-muted-foreground mt-0.5 text-sm">
				{#if unscheduled > 0}
					{unscheduled}
					{unscheduled === 1 ? 'talk needs' : 'talks need'} a slot.
				{:else if board.placed.length === 0}
					Nothing has been accepted yet, so there is nothing to schedule.
				{:else}
					Every accepted talk has a slot.
				{/if}
				{#if publicState}
					<span data-testid="agenda-public-state">{publicState}</span>
				{/if}
				{#if board.conflicts.length > 0}
					<span class="text-status-bad font-medium">
						{board.conflicts.length}
						{board.conflicts.length === 1 ? 'clash' : 'clashes'} to resolve.
					</span>
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<form method="POST" action="?/autoPlace" use:enhance={submitting}>
				<Button type="submit" variant="outline" disabled={busy || unscheduled === 0}>
					Fill the empty slots
				</Button>
			</form>
			{#if unscheduled > 0}
				<p class="text-muted-foreground text-xs" data-testid="agenda-autoplace-hint">
					{autoPlaceHint}
				</p>
			{/if}
			<form method="POST" action="?/publish" use:enhance={submitting}>
				<input type="hidden" name="published" value={everythingPublished ? 'false' : 'true'} />
				<!--
					Publish is the action this screen exists to take. Unpublish used to
					be the same filled button, so once the programme was live the
					loudest control took it down (#497).
				-->
				<Button
					type="submit"
					variant={everythingPublished ? 'outline' : 'default'}
					disabled={busy || placedTalks.length === 0}
					data-testid="agenda-publish"
				>
					{everythingPublished ? 'Unpublish the agenda' : 'Publish the agenda'}
				</Button>
			</form>
			<Button href="/c/{data.conference.slug}/agenda" variant="ghost" target="_blank">
				View the public agenda
			</Button>
		</div>
	</div>
</div>

<!--
	The one form every drop posts. It is the page's, not a block's: the block that
	started the drag is re-rendered by the update that follows, and a form living
	inside it would be submitting itself out of existence.
-->
<form
	method="POST"
	action="?/place"
	class="hidden"
	bind:this={placeForm}
	use:enhance={submitting}
	data-testid="agenda-drop-form"
>
	<input type="hidden" name="placementId" value={pending?.placementId ?? ''} />
	<input type="hidden" name="dayId" value={day?.id ?? ''} />
	<input type="hidden" name="roomId" value={pending?.roomId ?? ''} />
	<input type="hidden" name="startMinutes" value={pending?.startMinutes ?? ''} />
</form>

<!-- Wide on purpose — this is the grid — but never flush against the rail. -->
<div class="space-y-6 px-6 py-5">
	{#if form?.error}
		<p class="text-status-bad text-sm">{form.error}</p>
	{/if}
	{#if form?.autoPlaced !== undefined}
		<p class="text-muted-foreground text-sm">
			{form.autoPlaced === 0
				? 'Nothing could be placed — every room is full for the length of those sessions.'
				: `Placed ${form.autoPlaced} ${form.autoPlaced === 1 ? 'session' : 'sessions'}. Move anything you disagree with.`}
		</p>
	{/if}
	{#if form?.published !== undefined}
		<p class="text-muted-foreground text-sm" data-testid="agenda-publish-result" role="status">
			{form.published
				? liveTalks.length === 0
					? // The slots are confirmed; what keeps them off the public page is the
						// decision on the talk, and naming the wrong reason sends the
						// organizer to the grid to look for a placement problem.
						'Nothing went live — a slot only appears publicly once its talk is accepted.'
					: `The public agenda now shows ${liveTalks.length} ${liveTalks.length === 1 ? 'session' : 'sessions'}.`
				: 'Taken off the public agenda. These slots are only visible to you.'}
		</p>
	{/if}

	{#if board.days.length === 0 || board.rooms.length === 0}
		<p class="border-border bg-muted/40 rounded-lg border p-4 text-sm">
			A grid needs at least one day and one room.
			{#if board.rooms.length === 0}
				Add rooms in
				<a class="underline" href="{base}/settings">settings</a>.
			{/if}
			{#if board.days.length === 0}
				Days follow from the conference dates — set the start and end date in
				<a class="underline" href="{base}/settings">settings</a>.
			{/if}
		</p>
	{/if}

	<div class="grid gap-6 lg:grid-cols-[16rem_1fr]">
		<!-- The tray -->
		<section class="border-border bg-card h-fit rounded-lg border p-4">
			<h2 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
				Waiting for a slot
			</h2>

			{#if board.tray.length === 0}
				<p class="text-muted-foreground mt-3 text-sm">
					Nothing is waiting. Accepted talks arrive here automatically.
				</p>
			{:else}
				<ul class="mt-3 space-y-3">
					{#each board.tray as item (item.placementId)}
						<li
							data-testid="agenda-tray-item"
							data-placement-id={item.placementId}
							class="border-border min-w-0 cursor-grab touch-none overflow-hidden rounded-md border p-3 select-none {drag
								.dragging?.placementId === item.placementId
								? 'opacity-40'
								: ''}"
							onpointerdown={(e) =>
								drag.begin(e, { placementId: item.placementId, title: item.title, roomId: null })}
						>
							<p class="min-w-0 text-sm font-medium break-words" title={item.title}>{item.title}</p>
							<p class="text-muted-foreground mt-0.5 min-w-0 truncate text-xs">
								{item.speakers.join(', ') || 'No speaker'}
								{#if item.formatName}<span class="px-1">·</span>{item.formatName}{/if}
								<span class="px-1">·</span>{item.minutes} min
							</p>
							{#if item.submissionStatus === 'rejected'}
								<p
									class="text-status-bad mt-1.5 text-xs font-medium"
									data-testid="rejected-placement-badge"
								>
									Declined — still placed
								</p>
							{:else if item.submissionStatus === 'waitlisted'}
								<p
									class="text-status-warn mt-1.5 text-xs font-medium"
									data-testid="rejected-placement-badge"
								>
									Waitlisted — still placed
								</p>
							{/if}

							<p class="text-muted-foreground mt-2 text-xs">
								Drag it onto the grid, or open a slot to put it there.
							</p>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="border-border mt-4 space-y-3 border-t pt-4">
				{#if board.tracks.length > 0}
					<p class="text-muted-foreground text-xs">
						Tracks: {board.tracks.map((t) => t.name).join(', ')}
					</p>
				{/if}
				<p class="text-muted-foreground text-xs">
					Rooms, tracks and formats live in
					<a class="underline" href="{base}/settings">settings</a>.
				</p>
			</div>
		</section>

		<!-- The grid -->
		<section class="min-w-0">
			{#if board.days.length > 1}
				<div class="border-border mb-4 flex flex-wrap gap-1 border-b">
					{#each board.days as d, i (d.id)}
						<button
							type="button"
							onclick={() => (activeDay = i)}
							class="border-b-2 px-3 py-2 text-sm {i === activeDay
								? 'border-foreground font-medium'
								: 'text-muted-foreground border-transparent'}"
						>
							{formatDayLong(d.date)}
						</button>
					{/each}
				</div>
			{/if}

			{#if day}
				{#if dayBreaks.length > 0}
					<ul class="mb-4 flex flex-wrap gap-2">
						{#each dayBreaks as slot (slot.placementId)}
							<li class="border-border bg-muted/40 rounded-md border px-3 py-1.5 text-xs">
								<span class="font-medium tabular-nums">
									{timeLabel(slot.startMinutes)}–{timeLabel(slot.endMinutes)}
								</span>
								<span class="px-1.5">{slot.title}</span>
								<span class="text-muted-foreground">all rooms</span>
							</li>
						{/each}
					</ul>
				{/if}

				{#if board.rooms.length >= ROOM_FILTER_FROM}
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="sm"
									class="mb-4 gap-2 font-normal"
									data-testid="agenda-room-filter"
								>
									<span class="text-muted-foreground">Show</span>
									{filterLabel}
									<ChevronDownIcon class="size-4 opacity-60" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-64 p-2" align="start">
							<div class="max-h-72 overflow-auto">
								<label
									class="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
								>
									<Checkbox
										checked={selectedRooms.length === 0}
										onCheckedChange={() => (selectedRooms = [])}
									/>
									All {board.rooms.length} rooms
								</label>
								{#each board.rooms as room (room.id)}
									<label
										class="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
									>
										<Checkbox
											checked={selectedRooms.includes(room.id)}
											onCheckedChange={() => toggleRoom(room.id)}
										/>
										{room.name}
									</label>
								{/each}
							</div>
						</Popover.Content>
					</Popover.Root>
				{/if}

				<!--
					#219: with many rooms (World's Fair scale) column headers used to put
					"+ slot" beside the name, so similar room prefixes all read "M…". Name
					gets the full column width; the open-slot control sits under it. Published
					vs draft is a border colour, not a badge that ate title width. Full strings
					that CSS truncates come back via shadcn Tooltip (not title=).
					#64: the time gutter sticks so the organizer never loses "which hour
					am I in" while panning. Background + z-index so room cards do not
					paint through the sticky labels.
				-->
				<TooltipProvider>
					<div class="overflow-x-auto" data-testid="agenda-grid-scroll">
						<div class="flex w-full" bind:this={gridEl}>
							<!-- The time axis. Its header spacer matches the room-head height so
							     gutter labels line up with the columns without measuring. -->
							<div
								class="bg-background border-border sticky left-0 z-20 w-14 shrink-0 border-r"
								data-testid="agenda-time-gutter"
							>
								<div class="h-14"></div>
								<div class="relative" style="height: {gridHeight}">
									{#each gutter as label (label.minutes)}
										<span
											class="text-muted-foreground border-border absolute inset-x-0 border-t pt-0.5 pr-2 text-right text-xs tabular-nums"
											style="top: {label.top}"
										>
											{timeLabel(label.minutes)}
										</span>
									{/each}
								</div>
							</div>

							{#each visibleRooms as room (room.id)}
								<div
									class="border-border min-w-36 flex-1 overflow-hidden border-l"
									data-testid="agenda-room-card"
									data-room-id={room.id}
								>
									<div
										class="flex h-14 min-w-0 flex-col justify-center gap-0.5 px-1.5 py-1"
										data-testid="agenda-room-head"
									>
										<Tooltip>
											<!--
												Room name is mouse-tooltip only — full name is already in the
												DOM. TooltipTrigger defaults tabindex=0, which would add a
												tab stop per room (World's Fair ≈ 20). Keep it out of the
												sequence; the session card below stays a real control.
											-->
											<TooltipTrigger tabindex={-1}>
												{#snippet child({ props })}
													<h3
														{...props}
														data-testid="agenda-room-name"
														class="w-full min-w-0 truncate text-sm font-medium"
													>
														{room.name}
													</h3>
												{/snippet}
											</TooltipTrigger>
											<TooltipContent side="bottom" class="max-w-xs">
												{room.name}
											</TooltipContent>
										</Tooltip>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											class="h-6 w-full justify-start px-0 text-xs"
											aria-label="Open a slot in {room.name}"
											data-testid="agenda-open-slot-{room.id}"
											onclick={() => openSlot(room, data.slots[0].minutes)}
										>
											+ slot
										</Button>
									</div>

									<div class="relative min-w-0" data-column-body style="height: {gridHeight}">
										<!--
											One button per slot, all of them out of the tab order. The
											keyboard route into a slot is the room's "Open a slot"
											button and the editor's day/time/room selects; putting 36
											empty cells per room into the tab sequence would bury it.
										-->
										{#each frame.slots as minutes, i (minutes)}
											<button
												type="button"
												tabindex="-1"
												aria-label="{room.name} at {timeLabel(minutes)}"
												data-testid="agenda-slot-cell"
												data-room-id={room.id}
												data-start-minutes={minutes}
												onclick={() => slotClicked(room, minutes)}
												class="absolute inset-x-0 {i % LABEL_EVERY === 0
													? 'border-border border-t'
													: ''} {drag.hover?.roomId === room.id &&
												drag.hover?.startMinutes === minutes
													? 'bg-primary/20'
													: 'hover:bg-muted/60'}"
												style="top: {i * ROW_REM}rem; height: {ROW_REM}rem"
											></button>
										{/each}

										{#each laneLayout(sessionsIn(room.id)) as { session, lane, lanes } (session.placementId)}
											{@const rows = blockRows(frame, session)}
											{@const clashes = clashesFor(session.placementId)}
											{@const speakerLine = session.speakers.join(', ') || 'No speaker'}
											{@const published = session.status === 'confirmed'}
											{@const decidedDown =
												session.submissionStatus === 'rejected' ||
												session.submissionStatus === 'waitlisted'}
											{#if rows}
												<!--
													Title first — the clock is already on the grid axis, so the
													card's job is the talk name. Colour codes publish state so the
													title keeps the full card width (#219); clash colour wins.
													A declined talk used to keep the published green, so "every
													accepted talk has a slot" read as if this one still counted
													(#497). min-w-0 + overflow-hidden still clip width
													(#154 / #166); nothing here changes DnD keys or drop targets.
												-->
												<div
													data-testid="agenda-placed-session"
													data-placement-id={session.placementId}
													data-publish-state={published ? 'published' : 'draft'}
													class="absolute z-10 min-h-8 min-w-0 overflow-hidden rounded-md border {clashes.length >
													0
														? 'border-status-bad bg-status-bad/10'
														: decidedDown
															? 'border-status-warn bg-status-warn-bg'
															: published
																? 'border-status-good bg-status-good-bg'
																: 'border-border bg-card'} {drag.dragging?.placementId ===
													session.placementId
														? 'opacity-40'
														: ''}"
													style="top: {(rows.row - 1) * ROW_REM}rem; height: {rows.span *
														ROW_REM}rem; left: calc({(lane / lanes) *
														100}% + 0.125rem); width: calc({100 /
														lanes}% - 0.25rem); max-width: calc({100 / lanes}% - 0.25rem)"
												>
													<!--
														Tooltip lives on the card button itself (child-snippet merge)
														so the title never nests a second interactive control inside
														the drag/edit button — Cypress still finds the same testids.
													-->
													<Tooltip>
														<TooltipTrigger>
															{#snippet child({ props })}
																<!--
																	Svelte 5: attributes after `{...props}` win. Our own
																	onclick/onpointerdown would drop bits-ui's handlers —
																	#onpointerdown is the only guard that stops mousedown
																	focus from opening the tooltip immediately, and
																	#onclick closes it. Call the forwarded handlers first,
																	then ours.

																	bits-ui types the child snippet's props as `{}`, so
																	narrow the two handlers we actually forward — not `any`.
																-->
																{@const tip = props as {
																	onclick?: (e: MouseEvent) => void;
																	onpointerdown?: (e: PointerEvent) => void;
																}}
																<button
																	{...props}
																	type="button"
																	data-testid="agenda-edit-slot-{session.placementId}"
																	onclick={(e) => {
																		tip.onclick?.(e);
																		slotClicked(room, session.startMinutes ?? 0);
																	}}
																	onpointerdown={(e) => {
																		tip.onpointerdown?.(e);
																		drag.begin(e, {
																			placementId: session.placementId,
																			title: session.title,
																			roomId: room.id
																		});
																	}}
																	class="flex h-full w-full min-w-0 cursor-grab touch-none flex-col overflow-hidden px-1.5 py-0.5 text-left select-none"
																>
																	<span class="sr-only">{published ? 'Published' : 'Draft'}</span>
																	<span
																		data-testid="agenda-session-title"
																		class="block min-w-0 shrink-0 truncate text-sm leading-tight font-medium"
																	>
																		{session.title}
																	</span>
																	<!-- Clock is secondary: the grid axis already places the block.
																	     Kept small so short slots still read the title first, and so
																	     existing E2E can pin a drop by the range text. A declined
																	     line used to draw on top of the range (#497); the axis
																	     already says when, so the label takes that row. -->
																	{#if !decidedDown}
																		<span
																			class="text-muted-foreground block min-w-0 shrink truncate text-[0.65rem] leading-tight tabular-nums"
																		>
																			{timeLabel(session.startMinutes)}–{timeLabel(
																				session.endMinutes
																			)}
																		</span>
																	{/if}
																	{#if session.submissionStatus === 'rejected'}
																		<span
																			class="text-status-bad block min-w-0 shrink truncate text-xs font-medium"
																			data-testid="rejected-placement-badge"
																			title="This talk was declined but its slot remains — remove or reassign it."
																		>
																			Declined
																		</span>
																	{:else if session.submissionStatus === 'waitlisted'}
																		<span
																			class="text-status-warn block min-w-0 shrink truncate text-xs font-medium"
																			data-testid="rejected-placement-badge"
																			title="This talk is waitlisted but its slot remains — remove or reassign it."
																		>
																			Waitlisted
																		</span>
																	{/if}

																	{#each clashes as clash, ci (ci)}
																		<span
																			data-testid="agenda-conflict"
																			class="text-status-bad block min-w-0 shrink truncate text-xs font-medium"
																			title={clash}
																		>
																			{clash}
																		</span>
																	{/each}

																	<span
																		class="text-muted-foreground mt-0.5 block min-h-0 min-w-0 shrink truncate text-xs"
																		title={session.trackName
																			? `${speakerLine} · ${session.trackName}`
																			: speakerLine}
																	>
																		{speakerLine}
																		{#if session.trackName}<span class="px-1">·</span
																			>{session.trackName}{/if}
																	</span>
																</button>
															{/snippet}
														</TooltipTrigger>
														<TooltipContent side="top" class="max-w-xs">
															{session.title}
														</TooltipContent>
													</Tooltip>
												</div>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</TooltipProvider>

				<p class="text-muted-foreground mt-3 text-xs">
					Drag a session to move it. Click a slot to open it — that is also how a session swaps
					places with another, or comes off the grid.
				</p>
			{/if}
		</section>
	</div>
</div>

{#if drag.dragging && drag.pointer}
	<!-- The thing under the cursor. `pointer-events-none` on purpose: it sits
	     exactly where the drop is measured, so anything else would make it its
	     own drop target. -->
	<div
		class="border-border bg-card pointer-events-none fixed z-50 max-w-48 truncate rounded-md border px-2 py-1 text-xs shadow-md"
		style="left: {drag.pointer.x + 12}px; top: {drag.pointer.y + 12}px"
	>
		{drag.dragging.title}
	</div>
{/if}

{#if editing}
	<SlotEditor
		target={editing}
		{occupant}
		{swapWith}
		tray={board.tray}
		days={board.days}
		rooms={board.rooms}
		slots={data.slots}
		activeDayId={day?.id}
		{busy}
		{timeLabel}
		close={closeSlot}
		submit={submittingSlot}
	/>
{/if}
