/**
 * What the error page says, as two pure functions (#377).
 *
 * They live here rather than inline in `+error.svelte` for one reason: the 5xx
 * rule is a promise about what does *not* reach a stranger, and a promise like
 * that deserves a test that runs the code rather than one that greps the
 * markup. An end-to-end test cannot help — provoking a real 500 in the suite
 * means breaking the app on purpose.
 */

/** The heading. Deliberately short: the sentence under it carries the detail. */
export function errorHeadline(status: number): string {
	if (status === 404) return 'That page is not here';
	if (status === 403) return 'Not yours to open';
	return 'Something broke';
}

/**
 * The sentence under the heading.
 *
 * Below 500 it is the message the throw carried. The app throws good ones —
 * "No conference with that address" beats anything generic this page could
 * invent — so passing it through is the whole point.
 *
 * From 500 up it never is. SvelteKit already replaces an *uncaught* error's
 * message with "Internal Error" so an internal detail cannot reach a stranger;
 * a deliberate `error(503, …)` is not covered by that and is written for an
 * operator, not a reader. One fixed line covers both.
 */
export function errorDetail(status: number, message: string | undefined | null): string {
	if (status >= 500) {
		return 'Something went wrong on our side. Nothing you did caused it, and trying again in a moment often works.';
	}
	return message?.trim() || 'No further detail came with this error.';
}
