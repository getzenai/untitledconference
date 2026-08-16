/**
 * Leave prompt for a parked browser draft (#787).
 *
 * One sentence at every surface that used to say "saved in this browser".
 * The copy lives here so a test can read it, and so the three call sites
 * cannot drift. It names where the text is and when it dies. It does not
 * say saved — localStorage is this browser, this device, this profile.
 */
export const BROWSER_DRAFT_LEAVE_PROMPT =
	'Only this text stays in this browser on this device. Another device, another profile, or a cleared store, and it is gone. Leave this page?';
