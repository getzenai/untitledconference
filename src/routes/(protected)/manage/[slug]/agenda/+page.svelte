<script lang="ts">
	/**
	 * The agenda builder — journey 2, step 8.
	 *
	 * Scheduling happens through the slot editor: open a slot, and either put a
	 * waiting talk in it or take out the one that is there. It replaced three
	 * dropdowns hanging off every card, which worked and read as a spreadsheet.
	 *
	 * This is the deterministic path, not the only planned one — drag-and-drop is
	 * meant to land on top of it for humans (#69). It is built first and kept
	 * visible on purpose: Cypress and the eval harness drive it, and it is what
	 * makes the grid usable from a keyboard.
	 *
	 * The tray on the left is every accepted talk with nowhere to be. The grid on the
	 * right is the conference. Conflicts are shown on the sessions that cause them,
	 * not collected in a panel somebody has to go and read.
	 */
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatDayLong } from '$lib/conference/public-view';
	import SlotEditor from './SlotEditor.svelte';

	let { data, form } = $props();

	const base = $derived(`/manage/${data.conference.slug}`);
	const board = $derived(data.board);

	let busy = $state(false);
	/** Which day the grid is showing. Days are tabs, not one endless column. */
	let activeDay = $state(0);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};

	const day = $derived(board.days[activeDay] ?? board.days[0]);

	/**
	 * The clashes a given session is part of, so a card can show its own.
	 *
	 * Filtered per card rather than indexed once: a conference has a handful of
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
	 * Twenty rooms is twenty cards, and the one you are looking at is somewhere past
	 * the fold. Narrowing to a single room is the cheap way out; it is a view filter
	 * only — the slot editor's room select keeps offering every room, so nothing
	 * becomes unreachable by hiding it.
	 */
	const ROOM_FILTER_FROM = 6;
	let roomFilter = $state('all');
	const visibleRooms = $derived(
		roomFilter === 'all' ? board.rooms : board.rooms.filter((r) => String(r.id) === roomFilter)
	);

	const unscheduled = $derived(board.tray.length);
	const everythingPublished = $derived(
		board.placed.length > 0 && board.placed.every((p) => p.status === 'confirmed')
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

	const openSlot = (room: { id: number; name: string }, startMinutes: number) => {
		editing = { roomId: room.id, roomName: room.name, startMinutes };
	};

	const closeSlot = () => {
		editing = null;
	};

	/** Close on a successful write, so the grid behind the dialog is the answer. */
	const submittingSlot = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
				closeSlot();
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeSlot()} />

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
			<form method="POST" action="?/publish" use:enhance={submitting}>
				<input type="hidden" name="published" value={everythingPublished ? 'false' : 'true'} />
				<Button type="submit" disabled={busy || board.placed.length === 0}>
					{everythingPublished ? 'Unpublish the agenda' : 'Publish the agenda'}
				</Button>
			</form>
			<Button href="/c/{data.conference.slug}/agenda" variant="ghost" target="_blank">
				View the public agenda
			</Button>
		</div>
	</div>
</div>

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

	<div class="grid gap-6 lg:grid-cols-[20rem_1fr]">
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
						<li class="border-border rounded-md border p-3">
							<p class="text-sm font-medium">{item.title}</p>
							<p class="text-muted-foreground mt-0.5 text-xs">
								{item.speakers.join(', ') || 'No speaker'}
								{#if item.formatName}<span class="px-1">·</span>{item.formatName}{/if}
								<span class="px-1">·</span>{item.minutes} min
							</p>

							<p class="text-muted-foreground mt-2 text-xs">
								Open a slot on the grid to put this somewhere.
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
					<label class="mb-4 flex items-center gap-2 text-sm">
						<span class="text-muted-foreground">Show</span>
						<select
							bind:value={roomFilter}
							data-testid="agenda-room-filter"
							class="border-input bg-background rounded-md border px-2 py-1 text-sm"
						>
							<option value="all">All {board.rooms.length} rooms</option>
							{#each board.rooms as room (room.id)}
								<option value={String(room.id)}>{room.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each visibleRooms as room (room.id)}
						<div class="border-border bg-card rounded-lg border p-3" data-testid="agenda-room-card">
							<div class="flex items-baseline justify-between gap-2">
								<h3 class="text-sm font-medium">{room.name}</h3>
								<Button
									type="button"
									size="sm"
									variant="outline"
									data-testid="agenda-open-slot-{room.id}"
									onclick={() => openSlot(room, data.slots[0].minutes)}
								>
									Open a slot
								</Button>
							</div>

							{#if sessionsIn(room.id).length === 0}
								<p class="text-muted-foreground mt-2 text-xs">Empty on this day.</p>
							{:else}
								<ul class="mt-2 space-y-2">
									{#each sessionsIn(room.id) as session (session.placementId)}
										{@const clashes = clashesFor(session.placementId)}
										<li
											data-testid="agenda-placed-session"
											class="rounded-md border p-2 {clashes.length > 0
												? 'border-status-bad'
												: 'border-border'}"
										>
											<div class="flex items-baseline justify-between gap-2">
												<span class="text-xs font-medium tabular-nums">
													{timeLabel(session.startMinutes)}–{timeLabel(session.endMinutes)}
												</span>
												<Badge variant={session.status === 'confirmed' ? 'secondary' : 'outline'}>
													{session.status === 'confirmed' ? 'Published' : 'Draft'}
												</Badge>
											</div>
											<p class="mt-1 text-sm">{session.title}</p>
											<p class="text-muted-foreground text-xs">
												{session.speakers.join(', ') || 'No speaker'}
												{#if session.trackName}<span class="px-1">·</span>{session.trackName}{/if}
											</p>

											{#each clashes as clash (clash)}
												<p
													data-testid="agenda-conflict"
													class="text-status-bad mt-1 text-xs font-medium"
												>
													{clash}
												</p>
											{/each}

											<div class="mt-2 flex flex-wrap items-end gap-1.5">
												<Button
													type="button"
													size="sm"
													variant="outline"
													data-testid="agenda-edit-slot-{session.placementId}"
													onclick={() => openSlot(room, session.startMinutes ?? 0)}
												>
													Edit slot
												</Button>

												<form method="POST" action="?/toggleOne" use:enhance={submitting}>
													<input type="hidden" name="placementId" value={session.placementId} />
													<input
														type="hidden"
														name="status"
														value={session.status === 'confirmed' ? 'tentative' : 'confirmed'}
													/>
													<Button type="submit" size="sm" variant="ghost" disabled={busy}>
														{session.status === 'confirmed' ? 'Hold back' : 'Publish'}
													</Button>
												</form>

												<form method="POST" action="?/unplace" use:enhance={submitting}>
													<input type="hidden" name="placementId" value={session.placementId} />
													<Button type="submit" size="sm" variant="ghost" disabled={busy}>
														Remove
													</Button>
												</form>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>

{#if editing}
	<SlotEditor
		target={editing}
		{occupant}
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
