/**
 * Bookkeeping that must live as long as the Chat, not the sheet (#728).
 *
 * The panel unmounts on close. If these sets die with it, the refresh effect
 * walks the retained transcript on the next open and calls `invalidateAll`
 * once per past auto-run write.
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
