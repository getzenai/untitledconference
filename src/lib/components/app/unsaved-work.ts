/**
 * When leaving a page should cost a question first (#435).
 *
 * The decision is a function rather than three `if`s inside the guard because
 * the interesting part is which kinds of leaving count — and that is a claim
 * worth a test. The component around it only turns the answer into a `confirm`
 * or a `cancel`.
 */
import type { BeforeNavigate } from '@sveltejs/kit';

export type LeaveDecision =
	/** Nothing typed, or the navigation is the form's own — let it go. */
	| 'allow'
	/** Ask the person, in our words. */
	| 'ask'
	/** Hand the question to the browser (reload, tab close, back out of the app). */
	| 'defer';

/**
 * `form` is the page's own submit and must never be blocked — the whole point
 * of the guard is that the work reaches the server, and this is the navigation
 * that takes it there.
 *
 * `leave` is a reload, a closed tab or an address typed over ours. The page
 * cannot draw a dialog there; only the browser can, and it does so when the
 * navigation is cancelled. So the answer is `defer` and the wording is theirs,
 * not ours.
 */
export function leaveDecision(dirty: boolean, type: BeforeNavigate['type']): LeaveDecision {
	if (!dirty) return 'allow';
	if (type === 'form') return 'allow';
	if (type === 'leave') return 'defer';
	return 'ask';
}

/** One wording for every form, so leaving twice reads the same twice. */
export const UNSAVED_PROMPT =
	'You have typed something that has not been saved. Leave this page and lose it?';
