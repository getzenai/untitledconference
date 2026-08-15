<script lang="ts">
	/**
	 * The slot editor.
	 *
	 * One dialog, two shapes: an empty slot offers the waiting talks, a taken one
	 * shows what is in it, offers to trade it with another session on the day, and
	 * offers to take it out. Each submits an action the board owns — `?/place`,
	 * `?/swap`, `?/unplace` — so anything the editor can do, a form post can do.
	 *
	 * There is no "move here" onto a taken slot, and that absence is deliberate.
	 * `placeSession` is permissive about conflicts on purpose (agenda.ts), so a
	 * move would not swap and would not refuse — it would quietly double-book and
	 * report a clash afterwards. The two honest readings of the gesture are both
	 * offered instead: exchange the two sessions, or empty the slot first.
	 *
	 * It lives in its own file so the room list it renders can be tested against
	 * props directly. That test can only prove the second half of the contract —
	 * "renders every room it is given". Whether the *page* hands it every room or
	 * the filtered ones is a question about the page, and is pinned in the Cypress
	 * agenda spec with the room filter actually set.
	 */
	import { enhance } from '$lib/forms/enhance';
	import AppSelect from '$lib/components/app/app-select.svelte';
	import { Button } from '$lib/components/ui/button';

	/**
	 * Structural props rather than the server module's `BoardSession`/`AgendaBoard`.
	 * Those types live under `$lib/server`, and reaching into that from a component
	 * — even for a type — points the wrong way across the boundary the directory
	 * exists to draw.
	 */
	type Session = {
		placementId: number;
		title: string;
		minutes: number;
		startMinutes: number | null;
		endMinutes: number | null;
		speakers: string[];
		/** `confirmed` once it is on the public agenda; `tentative` while it is a draft. */
		status: string;
		/**
		 * `session` is a talk. `block` is a break and `reservation` a sponsor hold —
		 * both are slots the programme has already spent, and neither can be swapped
		 * or taken out here (#450). Optional so the tray items, which are always
		 * talks, can be passed as they are.
		 */
		kind?: string;
	};

	/** A session already on the grid, offered as the other half of a swap. */
	type SwapCandidate = {
		placementId: number;
		title: string;
		startMinutes: number | null;
		roomName: string;
	};

	type Props = {
		/** The slot being edited: which room, which minute of the day. */
		target: { roomId: number; roomName: string; startMinutes: number };
		/** What already starts in that slot, if anything. */
		occupant: Session | null;
		/**
		 * The other scheduled sessions the occupant may trade places with. The caller
		 * decides the set — same day, and never a break, which has no room to give.
		 */
		swapWith: SwapCandidate[];
		tray: Session[];
		/**
		 * Draft talks already on the grid, offered as a second candidate slot
		 * (#559). Empty while the occupant is a published session — that one
		 * is moved, not copied.
		 */
		alsoOnGrid: (Session & { roomName: string })[];
		days: { id: number; date: string }[];
		rooms: { id: number; name: string }[];
		slots: { minutes: number; label: string }[];
		/** Preselects the day tab the organizer is looking at. */
		activeDayId: number | undefined;
		busy: boolean;
		timeLabel: (minutes: number | null) => string;
		close: () => void;
		/** The page's `use:enhance` callback, so both write paths stay identical. */
		submit: Parameters<typeof enhance>[1];
	};

	let {
		target,
		occupant,
		swapWith,
		tray,
		alsoOnGrid,
		days,
		rooms,
		slots,
		activeDayId,
		busy,
		timeLabel,
		close,
		submit
	}: Props = $props();

	/**
	 * The hold in this slot, if the slot holds one — `block` for a break,
	 * `reservation` for a sponsor slot, and null for a talk (#450). Missing `kind`
	 * reads as a talk, which is what every caller that omits it means.
	 */
	const hold = $derived(
		occupant && occupant.kind && occupant.kind !== 'session' ? occupant.kind : null
	);

	/**
	 * The five option lists (#167).
	 *
	 * Values are strings because a form field is a string either way — the native
	 * `<option value={4}>` posted "4" too. What changes is that an app select
	 * shows a placeholder when `value` matches no option, where the browser
	 * silently fell back to the first one. Every `value` below therefore names a
	 * real member of its list, and `activeDayId` gets the fallback the browser
	 * used to supply.
	 */
	const swapWithOptions = $derived(
		swapWith.map((candidate) => ({
			value: String(candidate.placementId),
			label: `${candidate.title} (${timeLabel(candidate.startMinutes)}, ${candidate.roomName})`
		}))
	);

	const sessionOptions = $derived([
		...tray.map((item) => ({
			value: String(item.placementId),
			label: `${item.title} (${item.minutes} min)`
		})),
		...alsoOnGrid.map((item) => ({
			value: String(item.placementId),
			label: `${item.title} (also — already in ${item.roomName} at ${timeLabel(item.startMinutes)})`
		}))
	]);

	const placeable = $derived(sessionOptions.length > 0);

	const dayOptions = $derived(days.map((d) => ({ value: String(d.id), label: d.date.slice(5) })));

	/** What the browser picked when no `<option>` carried `selected`. */
	const selectedDayId = $derived(
		days.some((d) => d.id === activeDayId) ? activeDayId : days[0]?.id
	);

	const slotOptions = $derived(
		slots.map((slot) => ({ value: String(slot.minutes), label: slot.label }))
	);

	const roomOptions = $derived(rooms.map((r) => ({ value: String(r.id), label: r.name })));
</script>

<!--
	A plain fixed overlay rather than a dialog component: the page has no modal
	anywhere else, and an agent driving this needs stable markup more than it
	needs a focus-trap library.
-->
<div
	class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4"
	role="presentation"
	onclick={(event) => event.target === event.currentTarget && close()}
>
	<div
		class="border-border bg-card w-full max-w-md rounded-lg border p-5 shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Slot editor"
		data-testid="agenda-slot-editor"
	>
		<div class="flex items-baseline justify-between gap-2">
			<h2 class="text-sm font-semibold">
				{target.roomName}
				<span class="text-muted-foreground px-1">·</span>
				<span class="tabular-nums">{timeLabel(target.startMinutes)}</span>
			</h2>
			<Button type="button" size="sm" variant="ghost" onclick={close}>Close</Button>
		</div>

		{#if occupant}
			<!--
				Taken. Traded or emptied, never overwritten: putting another session
				here would not swap and would not be refused, it would double-book.
			-->
			<p class="mt-4 text-sm font-medium">{occupant.title}</p>
			<p class="text-muted-foreground mt-0.5 text-xs">
				{#if hold}
					{hold === 'reservation' ? 'Sponsor hold' : 'Break'}
				{:else}
					{occupant.speakers.join(', ') || 'No speaker'}
				{/if}
				<span class="px-1">·</span>
				{timeLabel(occupant.startMinutes)}–{timeLabel(occupant.endMinutes)}
			</p>

			{#if hold}
				<!--
					A hold is not a session, and the three session moves are not offered for
					it (#450). Swapping or taking it out would read its length off a format
					it does not have and hand a two-hour sponsor slot back as thirty minutes;
					taking it out would also park it where only talks are shown, so the slot
					would disappear from the screen while the decision count still counts it.
					Releasing is the one honest move, and it is the same `?/release` the strip
					above the grid posts.
				-->
				<form method="POST" action="?/release" use:enhance={submit} class="mt-4">
					<input type="hidden" name="placementId" value={occupant.placementId} />
					<Button type="submit" variant="outline" disabled={busy} data-testid="agenda-slot-release">
						{hold === 'reservation' ? 'Release this hold' : 'Remove this break'}
					</Button>
				</form>
				<p class="text-muted-foreground mt-2 text-xs">
					{hold === 'reservation'
						? 'Releasing gives the slot back to the programme. To move it, release it and hold the slot you want.'
						: 'To move it, remove it and put the break on the slot you want.'}
				</p>
			{:else}
				{#if swapWith.length > 0}
					<form method="POST" action="?/swap" use:enhance={submit} class="mt-4 space-y-3">
						<input type="hidden" name="placementId" value={occupant.placementId} />
						<div class="block text-sm">
							<span class="text-muted-foreground text-xs">Swap with</span>
							<!-- Seeded with the first candidate, because that is what the native
						     element posted: a `<select required>` with no empty option always
						     has a value. An app select starts empty unless told otherwise, so
						     leaving `value` off would turn "Trade places" into a submit that
						     posts nothing. -->
							<AppSelect
								name="withPlacementId"
								required
								testId="agenda-slot-swap-with"
								aria-label="Swap with"
								class="mt-1"
								value={String(swapWith[0].placementId)}
								options={swapWithOptions}
							/>
						</div>
						<Button type="submit" disabled={busy} data-testid="agenda-slot-swap"
							>Trade places</Button
						>
					</form>
				{/if}

				<div class="mt-4 flex flex-wrap gap-2">
					<form method="POST" action="?/unplace" use:enhance={submit}>
						<input type="hidden" name="placementId" value={occupant.placementId} />
						<Button
							type="submit"
							variant="outline"
							disabled={busy}
							data-testid="agenda-slot-remove"
						>
							Take it out of this slot
						</Button>
					</form>

					<!--
					Publishing one session lives here rather than on the block. A calendar
					block is as tall as the talk is long, so a 15-minute one has room for
					a time and a title and nothing else — hanging buttons off it would
					either overflow the block or make every block the same height, which
					is the thing the calendar exists to stop doing.
				-->
					<form method="POST" action="?/toggleOne" use:enhance={submit}>
						<input type="hidden" name="placementId" value={occupant.placementId} />
						<input
							type="hidden"
							name="status"
							value={occupant.status === 'confirmed' ? 'tentative' : 'confirmed'}
						/>
						<Button type="submit" variant="ghost" disabled={busy} data-testid="agenda-slot-status">
							{occupant.status === 'confirmed' ? 'Make draft' : 'Publish it'}
						</Button>
					</form>
				</div>
				<p class="text-muted-foreground mt-2 text-xs">
					{#if occupant.status === 'confirmed'}
						Make draft takes it off the public agenda. To move it, take it out here and open the
						slot you want, or drag it — dragging always moves.
					{:else}
						To move it, take it out here and open the slot you want, or drag it — dragging always
						moves. To preview a draft in two places, hold Alt while you drag, or pick one below.
					{/if}
				</p>

				{#if occupant.status === 'tentative' && placeable}
					<form
						method="POST"
						action="?/place"
						use:enhance={submit}
						class="border-border mt-4 space-y-3 border-t pt-4"
					>
						<input type="hidden" name="dayId" value={selectedDayId ?? ''} />
						<input type="hidden" name="startMinutes" value={target.startMinutes} />
						<input type="hidden" name="roomId" value={target.roomId} />
						<!-- The keyboard-and-touch way to the same thing Alt+drag does, and
						     the only way on a finger (#596). A talk from the tray is placed
						     rather than copied — it has no slot to keep. -->
						<input type="hidden" name="intent" value="alternative" />
						<div class="block text-sm">
							<span class="text-muted-foreground text-xs">Preview this placement</span>
							<AppSelect
								name="placementId"
								required
								testId="agenda-slot-also"
								aria-label="Preview this placement"
								class="mt-1"
								value={String((tray[0] ?? alsoOnGrid[0]).placementId)}
								options={sessionOptions}
							/>
							<p class="text-muted-foreground mt-1 text-xs">
								Puts a draft copy in this slot. The original stays where it is.
							</p>
						</div>
						<Button
							type="submit"
							variant="outline"
							disabled={busy}
							data-testid="agenda-slot-also-place"
						>
							Keep both as alternatives
						</Button>
					</form>
				{/if}
			{/if}
		{:else if !placeable}
			<p class="text-muted-foreground mt-4 text-sm">
				Nothing is unscheduled. Take a talk out of another slot first.
			</p>
		{:else}
			<form method="POST" action="?/place" use:enhance={submit} class="mt-4 space-y-3">
				<div class="block text-sm">
					<span class="text-muted-foreground text-xs">Talk</span>
					<!-- Same seeding rule as "Swap with": the native element posted the
					     first tray item without anyone picking it. -->
					<AppSelect
						name="placementId"
						required
						testId="agenda-slot-session"
						aria-label="Talk"
						class="mt-1"
						value={String((tray[0] ?? alsoOnGrid[0]).placementId)}
						options={sessionOptions}
					/>
				</div>

				<div class="grid grid-cols-3 gap-2">
					<div class="block text-sm">
						<span class="text-muted-foreground text-xs">Day</span>
						<AppSelect
							name="dayId"
							size="sm"
							testId="agenda-slot-day"
							aria-label="Day"
							class="mt-1"
							value={selectedDayId === undefined ? '' : String(selectedDayId)}
							options={dayOptions}
						/>
					</div>
					<div class="block text-sm">
						<span class="text-muted-foreground text-xs">Start</span>
						<AppSelect
							name="startMinutes"
							size="sm"
							testId="agenda-slot-start"
							aria-label="Start"
							class="mt-1"
							value={String(target.startMinutes)}
							options={slotOptions}
						/>
					</div>
					<!--
						Whatever `rooms` holds is rendered as-is. The caller decides the
						list, and the caller's job is to pass the unfiltered one — a view
						filter must never make a destination unreachable.
					-->
					<div class="block text-sm">
						<span class="text-muted-foreground text-xs">Room</span>
						<AppSelect
							name="roomId"
							size="sm"
							testId="agenda-slot-room"
							aria-label="Room"
							class="mt-1"
							value={String(target.roomId)}
							options={roomOptions}
						/>
					</div>
				</div>

				<div class="flex flex-wrap gap-2">
					<Button type="submit" disabled={busy} data-testid="agenda-slot-place">
						Put it in this slot
					</Button>
					<!--
						The alternative without a keyboard (#596). Dragging is a move now,
						and Alt is the copy — but there is no Alt on a finger, so the same
						choice has to exist as a button. The submitter's own name/value is
						what carries the intent: the plain button posts nothing and the
						server reads a missing field as a move.

						Only offered when there is a placed draft to pick. A talk from the
						tray has no slot to keep, so this would be the same act as the
						button beside it.
					-->
					{#if alsoOnGrid.length > 0}
						<Button
							type="submit"
							name="intent"
							value="alternative"
							variant="outline"
							disabled={busy}
							data-testid="agenda-slot-place-also"
						>
							Keep its current slot too
						</Button>
					{/if}
				</div>
			</form>
		{/if}
	</div>
</div>
