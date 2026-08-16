/**
 * Leave prompt for a parked browser draft (#787).
 *
 * One sentence, one source. `what` is the field this guard actually
 * tracks — not the page — so the sentence cannot promise more than
 * `dirty` covers (#788). It names where that text is and when it dies.
 * It does not say saved — localStorage is this browser, this device,
 * this profile.
 */
export function browserDraftLeavePrompt(what: string): string {
	return `Only ${what} stay in this browser on this device. Another device, another profile, or clearing your browser data, and it is gone. Leave this page?`;
}
