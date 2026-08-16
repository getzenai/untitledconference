/**
 * Where a parked browser draft lives, and when it dies (#787, #801).
 *
 * One sentence, one source. `what` is the field this actually
 * tracks — not the page — so the sentence cannot promise more than
 * the parked copy covers (#788). It does not say saved — localStorage
 * is this browser, this device, this profile.
 */
export function browserDraftStayHint(what: string): string {
	return `Only ${what} will stay in this browser on this device. Another device, another profile, or clearing your browser data, and it is gone.`;
}

/** Leave prompt: the stay hint plus the question the guard asks. */
export function browserDraftLeavePrompt(what: string): string {
	return `${browserDraftStayHint(what)} Leave this page?`;
}
