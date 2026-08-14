/**
 * The three places an accepted talk can sit (#466).
 *
 * Named once so dashboard and agenda cannot answer "is the programme finished?"
 * with two different words. `confirmed` is a database value; the screens say
 * `published`.
 *
 *   unplaced  — no slot (not even in the tray, or still waiting in it)
 *   draft     — on the grid, `tentative`, invisible to the public
 *   published — `confirmed`, on the public agenda
 *
 * Dashboard counts unplaced + draft (not yet published). Agenda's headline
 * counts only unplaced (still waiting for a slot). Both numbers are right;
 * both sentences have to say which set they mean.
 */

export const PROGRAM_WORDS = {
	unplaced: 'unplaced',
	draft: 'draft',
	published: 'published'
} as const;

export type SchedulingCounts = {
	unplaced: number;
	/** Accepted talks with a tentative placement — tray or draft on the grid. */
	draft: number;
};

export function notPublished(counts: SchedulingCounts): number {
	return counts.unplaced + counts.draft;
}

/** Headline fragment. `null` when this queue is empty — the page joins others. */
export function dashboardSchedulingHeadline(counts: SchedulingCounts): string | null {
	const n = notPublished(counts);
	if (n === 0) return null;
	return n === 1 ? '1 accepted not yet published' : `${n} accepted not yet published`;
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
			? '1 unplaced talk needs a slot.'
			: `${ready.unplaced} unplaced talks need a slot.`;
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
		return 'Nothing could be placed — every room is full for the length of those sessions.';
	}
	const sessions = count === 1 ? 'session' : 'sessions';
	const pronoun = count === 1 ? 'It is' : 'They are';
	return `Placed ${count} ${sessions} as drafts. ${pronoun} invisible to the public until you publish. Move anything you disagree with.`;
}

export const PROGRAM_LEGEND = {
	published: 'Published — the public can see it',
	draft: 'Draft — only you can see it'
} as const;
