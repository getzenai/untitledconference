/**
 * Bookkeeping that must live as long as the Chat, not the sheet (#728).
 *
 * The launcher walks these sets while the Chat lives, including while the
 * sheet is closed. If they die with the panel, a write that already
 * refreshed the page is asked again on the next open.
 */
import { SvelteSet } from 'svelte/reactivity';

export type AssistantLedger = {
	approved: Set<string>;
	invalidated: Set<string>;
	stopped: Set<string>;
	stopFromIndex: number | null;
};

export function emptyAssistantLedger(): AssistantLedger {
	return {
		approved: new SvelteSet(),
		invalidated: new SvelteSet(),
		stopped: new SvelteSet(),
		stopFromIndex: null
	};
}
