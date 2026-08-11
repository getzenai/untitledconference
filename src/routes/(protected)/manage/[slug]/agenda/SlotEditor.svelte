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
	import { enhance } from '$app/forms';
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
		days,
		rooms,
		slots,
		activeDayId,
		busy,
		timeLabel,
		close,
		submit
	}: Props = $props();
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
				{occupant.speakers.join(', ') || 'No speaker'}
				<span class="px-1">·</span>
				{timeLabel(occupant.startMinutes)}–{timeLabel(occupant.endMinutes)}
			</p>

			{#if swapWith.length > 0}
				<form method="POST" action="?/swap" use:enhance={submit} class="mt-4 space-y-3">
					<input type="hidden" name="placementId" value={occupant.placementId} />
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Swap with</span>
						<select
							name="withPlacementId"
							required
							data-testid="agenda-slot-swap-with"
							class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
						>
							{#each swapWith as candidate (candidate.placementId)}
								<option value={candidate.placementId}>
									{candidate.title} ({timeLabel(candidate.startMinutes)}, {candidate.roomName})
								</option>
							{/each}
						</select>
					</label>
					<Button type="submit" disabled={busy} data-testid="agenda-slot-swap">Trade places</Button>
				</form>
			{/if}

			<form method="POST" action="?/unplace" use:enhance={submit} class="mt-4">
				<input type="hidden" name="placementId" value={occupant.placementId} />
				<Button type="submit" variant="outline" disabled={busy} data-testid="agenda-slot-remove">
					Take it out of this slot
				</Button>
			</form>
			<p class="text-muted-foreground mt-2 text-xs">
				To move it to an empty slot, take it out and open the one you want.
			</p>
		{:else if tray.length === 0}
			<p class="text-muted-foreground mt-4 text-sm">
				Nothing is waiting for a slot. Take a session out of another slot first.
			</p>
		{:else}
			<form method="POST" action="?/place" use:enhance={submit} class="mt-4 space-y-3">
				<label class="block text-sm">
					<span class="text-muted-foreground text-xs">Session</span>
					<select
						name="placementId"
						required
						data-testid="agenda-slot-session"
						class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
					>
						{#each tray as item (item.placementId)}
							<option value={item.placementId}>{item.title} ({item.minutes} min)</option>
						{/each}
					</select>
				</label>

				<div class="grid grid-cols-3 gap-2">
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Day</span>
						<select
							name="dayId"
							class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
						>
							{#each days as d (d.id)}
								<option value={d.id} selected={d.id === activeDayId}>{d.date.slice(5)}</option>
							{/each}
						</select>
					</label>
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Start</span>
						<select
							name="startMinutes"
							class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
						>
							{#each slots as slot (slot.minutes)}
								<option value={slot.minutes} selected={slot.minutes === target.startMinutes}>
									{slot.label}
								</option>
							{/each}
						</select>
					</label>
					<!--
						Whatever `rooms` holds is rendered as-is. The caller decides the
						list, and the caller's job is to pass the unfiltered one — a view
						filter must never make a destination unreachable.
					-->
					<label class="block text-sm">
						<span class="text-muted-foreground text-xs">Room</span>
						<select
							name="roomId"
							class="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
						>
							{#each rooms as r (r.id)}
								<option value={r.id} selected={r.id === target.roomId}>{r.name}</option>
							{/each}
						</select>
					</label>
				</div>

				<Button type="submit" disabled={busy} data-testid="agenda-slot-place">
					Put it in this slot
				</Button>
			</form>
		{/if}
	</div>
</div>
