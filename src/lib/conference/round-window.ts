/**
 * When a review round is actually running (ABS-01).
 *
 * #207 gave a round an `opensAt`/`closesAt` pair and said so out loud: recorded, not
 * enforced. That was the honest half — the organizer could finally state when a round
 * runs. This is the other half: a date a reviewer can post straight through is a note,
 * not a window, so the same question is answered here once and asked from the queue,
 * the scorecard, and `saveReview` alike.
 *
 * No database and no Svelte, for the same reason `review-visibility.ts` has neither:
 * the three of them must not each decide "is this round open" their own way. **What
 * this returns `closed` or `not_yet_open` for is refused on the server** — a window
 * enforced in the markup is decoration.
 *
 * A round with no dates is open. A committee that reads until it is done sets nothing,
 * and turning "unset" into "shut" would lock out every conference that predates the
 * feature.
 */

export type RoundWindowState = 'not_yet_open' | 'open' | 'closed';

/** The window before it has been put into words: what the two formatters read. */
export type RoundWindowFacts = {
	state: RoundWindowState;
	opensAt: Date | string | null;
	closesAt: Date | string | null;
};

export type RoundWindow = RoundWindowFacts & {
	/** The sentence a reviewer reads instead of a form; `null` while the round is open. */
	notice: string | null;
	/** Two or three words for a table cell: "Open", "Closed", "Opens in 2 days". */
	label: string;
};

/**
 * Deliberately the same shape and the same boundary handling as the call for papers'
 * own `callState` (`$lib/server/conference/cfp-submission.ts`): open is inclusive of
 * `opensAt` and exclusive of `closesAt`, so a round that closes at 17:00 takes nothing
 * at 17:00. Two windows in one product that disagree on the closing second is a bug
 * report nobody can read.
 */
export function roundWindowState(
	opensAt: Date | string | null,
	closesAt: Date | string | null,
	now: Date = new Date()
): RoundWindowState {
	if (opensAt && new Date(opensAt) > now) return 'not_yet_open';
	if (closesAt && new Date(closesAt) <= now) return 'closed';
	return 'open';
}

/**
 * The window as one value, wording included, ready to hand to a page.
 *
 * "Opens in 2 days" is counted here — on the server, in the loader — and not in the
 * component, for the reason the public call banner already states in
 * `(public)/c/[slug]/+layout.server.ts`: a count taken in the browser is taken at a
 * different instant and in the visitor's zone, so the same round would render one
 * number in the HTML and another after hydration.
 */
export function roundWindow(
	opensAt: Date | string | null,
	closesAt: Date | string | null,
	now: Date = new Date()
): RoundWindow {
	const facts: RoundWindowFacts = {
		state: roundWindowState(opensAt, closesAt, now),
		opensAt,
		closesAt
	};
	return { ...facts, notice: roundWindowNotice(facts, now), label: roundWindowLabel(facts, now) };
}

/**
 * Which of a reviewer's rounds on one submission speaks for the others.
 *
 * A comparator rather than a `find`, because the caller with the rows — not just the
 * windows — has to reach the same answer. `Array.prototype.sort` is stable, so ties
 * keep the order the query produced; give it rows in a deterministic order and the
 * choice is deterministic too.
 */
export function byRoundWindowPriority(a: RoundWindowFacts, b: RoundWindowFacts): number {
	return STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
}

const STATE_PRIORITY: Record<RoundWindowState, number> = { open: 0, not_yet_open: 1, closed: 2 };

/** Whole days between now and `when`, rounded up: "in 2 days" while any of day 2 is left. */
function daysUntil(when: Date, now: Date): number {
	return Math.ceil((when.getTime() - now.getTime()) / 86_400_000);
}

function relative(when: Date, now: Date): string {
	const days = daysUntil(when, now);
	if (days <= 0) return 'today';
	if (days === 1) return 'tomorrow';
	return `in ${days} days`;
}

/**
 * The one line a reviewer reads instead of a form.
 *
 * It names the state first and the date second, because "closed" is the part that
 * decides whether to keep typing and the date is only the explanation. `null` while
 * the round is open: there is nothing to explain.
 */
export function roundWindowNotice(window: RoundWindowFacts, now: Date = new Date()): string | null {
	if (window.state === 'not_yet_open') {
		const opens = window.opensAt ? new Date(window.opensAt) : null;
		return opens
			? `This review round opens ${relative(opens, now)} (${stamp(opens)}). Nothing can be reviewed until then.`
			: 'This review round has not opened yet.';
	}
	if (window.state === 'closed') {
		const closes = window.closesAt ? new Date(window.closesAt) : null;
		return closes
			? `This review round closed on ${stamp(closes)}. Reviews can no longer be submitted or changed.`
			: 'This review round is closed.';
	}
	return null;
}

/**
 * The badge tone each state wears, so the organizer's table and the reviewer's two
 * screens do not each pick their own green. The values are `StatusBadge`'s tone names
 * and nothing more — a string, not an import: this module still pulls in no component.
 */
export const ROUND_WINDOW_TONES: Record<RoundWindowState, 'good' | 'warn' | 'neutral'> = {
	open: 'good',
	not_yet_open: 'warn',
	closed: 'neutral'
};

/** Short badge text for a list, where the sentence above would not fit. */
export function roundWindowLabel(window: RoundWindowFacts, now: Date = new Date()): string {
	if (window.state === 'not_yet_open') {
		const opens = window.opensAt ? new Date(window.opensAt) : null;
		return opens ? `Opens ${relative(opens, now)}` : 'Not open yet';
	}
	if (window.state === 'closed') return 'Closed';
	return 'Open';
}

function stamp(value: Date): string {
	return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
