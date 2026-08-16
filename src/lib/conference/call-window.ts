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

/**
 * What a directory card can say about the call (#709).
 *
 * Three values, not the four `CallWindow` ones: the front door only needs to
 * know whether a visitor can submit, whether a CFP page exists but is shut,
 * or whether `/c/<slug>/cfp` will 404. `not_yet_open` is `closed` here — the
 * page is there, the form is not taking anything.
 */
export type DirectoryCall = 'open' | 'closed' | 'none';

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

/**
 * Collapse a published-or-closed form (or its absence) to a directory answer.
 *
 * `none` is the CFP 404: `openCall` returns null when there is no published or
 * closed form. A form that exists but is not taking submissions is `closed`.
 * The window itself is `callWindow` — the same function `/c/<slug>/cfp` uses.
 */
export function directoryCall(
	form: { opensAt: Instant; closesAt: Instant; status: string } | null,
	now: Date
): DirectoryCall {
	if (!form || (form.status !== 'published' && form.status !== 'closed')) return 'none';
	return callWindow(form.opensAt, form.closesAt, form.status === 'closed', now) === 'open'
		? 'open'
		: 'closed';
}
