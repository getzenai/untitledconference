/**
 * Whether the call for papers is taking submissions *right now*.
 *
 * Three places needed the same answer and each had written it out: the public
 * submission handler (`cfp-submission.ts`), the organizer's CFP page banner, and
 * — since #452 — the unpublish confirmation, which has to say whether taking the
 * conference offline interrupts speakers mid-submission. A published form is not
 * an open form: `opensAt` can still be ahead and `closesAt` can have passed.
 *
 * The comparison is inclusive at the start and exclusive at the end, which is
 * what `closesAt` means to a submitter — at the stroke of the deadline the form
 * is shut.
 */

/** Why the form is or is not accepting submissions right now (CFP-04, CFP-16). */
export type CallWindow = 'open' | 'not_yet_open' | 'closed';

/** Timestamps arrive as `Date` on the server and as strings once serialized. */
type Instant = Date | string | null | undefined;

function at(value: Instant): Date | null {
	if (!value) return null;
	return value instanceof Date ? value : new Date(value);
}

export function callWindow(
	opensAt: Instant,
	closesAt: Instant,
	closed: boolean,
	now: Date
): CallWindow {
	if (closed) return 'closed';
	const opens = at(opensAt);
	if (opens && opens > now) return 'not_yet_open';
	const closes = at(closesAt);
	if (closes && closes <= now) return 'closed';
	return 'open';
}
