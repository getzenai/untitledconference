/**
 * The three places an accepted talk can sit (#466).
 *
 * Named once so dashboard and agenda cannot answer "is the programme finished?"
 * with two different words. `confirmed` is a database value; the screens say
 * `published`. The split is the slot, not the existence of a placement row —
 * accepting writes a tentative row with no day or room (`putInAgendaTray`),
 * and that parked row is unplaced on both screens.
 *
 *   unplaced  — no placement, or a placement with no slot (the tray)
 *   draft     — tentative *with* a slot: white card on the grid, not public
 *   published — `confirmed`, on the public agenda
 *
 * Dashboard counts unplaced + draft (not yet published). Agenda's headline
 * counts only unplaced (still waiting for a slot). After a real accept those
 * two unplaced numbers are the same set.
 */

export const PROGRAM_WORDS = {
	unplaced: 'unplaced',
	draft: 'draft',
	published: 'published'
} as const;

/** The columns `isPlaced` / `schedulingGap` both need to draw the same line. */
export type PlacementSlot = {
	status: string;
	kind: string;
	dayId: number | null;
	roomId: number | null;
	startsAt: Date | null;
};

/**
 * Is this placement on the grid?
 *
 * A session needs day, time and room. A break does not: a null room means
 * "across every room", and requiring one would drop every lunch into the tray.
 */
export function placementHasSlot(row: {
	kind: string;
	dayId: number | null;
	roomId: number | null;
	startsAt: Date | null;
}): boolean {
	if (row.dayId === null || row.startsAt === null) return false;
	return row.kind !== 'session' || row.roomId !== null;
}

/**
 * One accepted talk, given the placements the server actually writes.
 *
 * The accept path inserts a tentative row with no day, room or time. That is
 * unplaced — the same box the agenda tray already uses — not a draft.
 */
export function classifyAcceptedTalk(
	placements: PlacementSlot[]
): 'unplaced' | 'draft' | 'published' {
	const slotted = placements.filter(placementHasSlot);
	if (slotted.some((p) => p.status === 'confirmed')) return 'published';
	if (slotted.length > 0) return 'draft';
	return 'unplaced';
}

export type SchedulingCounts = {
	unplaced: number;
	/** Accepted talks with a tentative placement *and* a slot. */
	draft: number;
};

export function notPublished(counts: SchedulingCounts): number {
	return counts.unplaced + counts.draft;
}

/** Headline fragment. `null` when this queue is empty — the page joins others. */
export function dashboardSchedulingHeadline(counts: SchedulingCounts): string | null {
	const n = notPublished(counts);
	if (n === 0) return null;
	return `${n} accepted not yet published`;
}

export function dashboardSchedulingTile(counts: SchedulingCounts): string {
	const n = notPublished(counts);
	return n === 0 ? 'every talk published' : `${n} not yet published`;
}

export function dashboardSchedulingEmpty(accepted: number): string {
	return accepted === 0 ? 'Nothing accepted yet.' : 'Every accepted talk is published.';
}

export function dashboardSchedulingSubhead(counts: SchedulingCounts): string {
	const drafts = counts.draft === 1 ? '1 draft' : `${counts.draft} drafts`;
	const unplaced = counts.unplaced === 1 ? '1 unplaced' : `${counts.unplaced} unplaced`;
	return `${drafts} · ${unplaced}`;
}

export function dashboardSchedulingLabel(state: 'unplaced' | 'tentative'): string {
	return state === 'unplaced' ? 'Unplaced' : 'Draft';
}

export type AgendaReady = {
	unplaced: number;
	draft: number;
	placed: number;
};

/**
 * The one sentence under Agenda. Counts unplaced (tray) for "needs a slot",
 * and names drafts so an empty tray is not read as "the programme is finished".
 */
export function agendaReadyLine(ready: AgendaReady): string {
	if (ready.unplaced > 0) {
		return ready.unplaced === 1
			? '1 talk is unscheduled.'
			: `${ready.unplaced} talks are unscheduled.`;
	}
	if (ready.placed === 0) {
		return 'Nothing has been accepted yet, so there is nothing to schedule.';
	}
	if (ready.draft > 0) {
		return ready.draft === 1
			? 'Every accepted talk has a slot. 1 is still a draft.'
			: `Every accepted talk has a slot. ${ready.draft} are still drafts.`;
	}
	return 'Every accepted talk has a published slot.';
}

export function autoPlaceResult(count: number): string {
	if (count === 0) {
		return 'Nothing could be placed — every room is full for the length of those talks.';
	}
	const talks = count === 1 ? 'talk' : 'talks';
	const pronoun = count === 1 ? 'It is' : 'They are';
	return `Placed ${count} ${talks} as drafts. ${pronoun} invisible to the public until you publish. Move anything you disagree with.`;
}

export const PROGRAM_LEGEND = {
	published: 'Published — the public can see it',
	draft: 'Draft — only you can see it'
} as const;
