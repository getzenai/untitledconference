/**
 * Who is on a talk, small enough to fit in a table cell (#414).
 *
 * The submissions table already says 1/3 — handed in over assigned. Fabian's
 * question was the other half of that fact: *which* three. The count tells an
 * organizer to chase someone; only the names tell them whom.
 *
 * One chip per reviewer, not per seat. A committee that runs two rounds
 * assigns the same people twice, and a row that shows "AB AB" reads as a bug
 * rather than as a second round — so the rounds collapse into the reviewer's
 * tooltip, where they explain the duplicate instead of being it.
 */
import { initials } from './public-view';

/** One row of the review table, as the cell needs it. */
export type ReviewSeat = {
	userId: string;
	name: string | null;
	email: string;
	round: string;
	submitted: boolean;
};

export type AssignedReviewer = {
	userId: string;
	/** Display name, or the email when the account has no name yet. */
	label: string;
	initials: string;
	/** Every round this person sits on for this talk, in the order they arrived. */
	rounds: string[];
	/** True while any of their seats is still unsubmitted — the ones to chase. */
	outstanding: boolean;
};

/**
 * An account with no name shows its email; initials fall back to its first
 * letter. An empty chip would be worse than a blunt one — it looks like a
 * rendering fault, and the organizer cannot tell it apart from a missing
 * assignment.
 */
function labelFor(seat: ReviewSeat): string {
	return seat.name?.trim() || seat.email;
}

export function assignedReviewers(seats: ReviewSeat[]): AssignedReviewer[] {
	const byUser = new Map<string, AssignedReviewer>();

	for (const seat of seats) {
		const label = labelFor(seat);
		let reviewer = byUser.get(seat.userId);
		if (!reviewer) {
			reviewer = {
				userId: seat.userId,
				label,
				initials: initials(label) || label.slice(0, 1).toUpperCase(),
				rounds: [],
				outstanding: false
			};
			byUser.set(seat.userId, reviewer);
		}
		if (!reviewer.rounds.includes(seat.round)) reviewer.rounds.push(seat.round);
		if (!seat.submitted) reviewer.outstanding = true;
	}

	return [...byUser.values()];
}

/**
 * The tooltip behind a chip: who, where, and whether they still owe us.
 *
 * The state is said in words rather than only in the chip's weight, because
 * the weight is the thing a colour-blind organizer cannot read.
 */
export function reviewerTitle(reviewer: AssignedReviewer): string {
	const where = reviewer.rounds.join(', ');
	const state = reviewer.outstanding ? 'not handed in' : 'handed in';
	return where ? `${reviewer.label} · ${where} · ${state}` : `${reviewer.label} · ${state}`;
}

/**
 * How many chips a row shows before the rest become "+N".
 *
 * Four is where a fully staffed talk still fits next to the count on a 1280px
 * screen; past that the column starts pushing the status out of view, which
 * costs more than the fifth name is worth.
 */
export const VISIBLE_CHIPS = 4;

export function chipOverflow(reviewers: AssignedReviewer[]): {
	shown: AssignedReviewer[];
	hidden: AssignedReviewer[];
} {
	if (reviewers.length <= VISIBLE_CHIPS) return { shown: reviewers, hidden: [] };
	return {
		shown: reviewers.slice(0, VISIBLE_CHIPS),
		hidden: reviewers.slice(VISIBLE_CHIPS)
	};
}
