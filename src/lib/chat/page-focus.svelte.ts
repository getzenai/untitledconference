/**
 * How a page tells the one assistant what is selected on it (#683).
 *
 * The star sits in the layout and knows nothing about the board below it. The
 * board knows which day is open, the scorecard knows which round it is for —
 * and that is the half of "move it to 14:00" that the URL does not carry.
 *
 * A page publishes here from an `$effect`; the returned cleanup runs when the
 * value changes and when the page unmounts, so a stale day cannot outlive the
 * screen it came from. The route id is stored with it and checked on read as
 * the second lock: between the moment a page unmounts and the moment the next
 * one publishes, the panel must send nothing rather than the last page's.
 */
export type PageFocus = Record<string, string | number | null | undefined>;

let current = $state<{ routeId: string; focus: PageFocus } | null>(null);

/**
 * Publish this page's selection. Call from an `$effect` and return the result:
 *
 * ```svelte
 * $effect(() => providePageFocus(page.route.id, { day: openDay }));
 * ```
 */
export function providePageFocus(routeId: string | null | undefined, focus: PageFocus): () => void {
	if (!routeId) return () => {};
	current = { routeId, focus };
	return () => {
		if (current?.routeId === routeId) current = null;
	};
}

/** What the page at `routeId` published, or nothing if that is not the page. */
export function pageFocus(routeId: string | null | undefined): PageFocus | undefined {
	if (!routeId || current?.routeId !== routeId) return undefined;
	return current.focus;
}
