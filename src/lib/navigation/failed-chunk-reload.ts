/**
 * One reload when the first load of a new tab asks for a hashed chunk that
 * the deploy just deleted (#887).
 *
 * #702 already covers a tab that was open: `reloadIfBuildIsStale` turns the
 * next click into a real page load. That path never runs here — there is no
 * client yet, so there is no `beforeNavigate`. The visitor who arrives in the
 * cutover second gets a TypeError, no hydrate, and `error.html`.
 *
 * The real fix is delivery order (keep the previous hashed files up). This
 * is only the plaster: reload once, then stop. A second pass that also
 * fails must show the error page, or a broken deploy becomes a loop.
 */

export const FAILED_CHUNK_RELOAD_MARKER = 'uc:failed-chunk-reload';

export type ReloadMarkerStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

function errorText(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}

/** The browser strings for a missing hashed module — not any other TypeError. */
export function isFailedDynamicImport(error: unknown): boolean {
	const text = errorText(error);
	return (
		/Failed to fetch dynamically imported module/i.test(text) ||
		/Importing a module script failed/i.test(text) ||
		/error loading dynamically imported module/i.test(text)
	);
}

/**
 * Whether this error should trigger a full page load. Sets the marker when
 * it says yes. The next call with the same storage must say no.
 */
export function shouldReloadFailedChunkOnce(
	error: unknown,
	storage: ReloadMarkerStorage | null
): boolean {
	if (!storage || !isFailedDynamicImport(error)) return false;
	if (storage.getItem(FAILED_CHUNK_RELOAD_MARKER)) return false;
	storage.setItem(FAILED_CHUNK_RELOAD_MARKER, '1');
	return true;
}

/** Call only after this load actually hydrated — never at client start. */
export function clearFailedChunkReloadMarker(storage: ReloadMarkerStorage | null): void {
	storage?.removeItem(FAILED_CHUNK_RELOAD_MARKER);
}

/**
 * The root layout sets `data-hydrated` in `onMount`. That is the proof this
 * load worked. Watching it from hooks keeps the clear out of +layout, so
 * #702's `beforeNavigate` path is not touched.
 */
export function clearMarkerOnceHydrated(
	storage: ReloadMarkerStorage | null,
	target: { dataset: DOMStringMap },
	observe: (onChange: () => void) => () => void
): () => void {
	let stop = () => {};
	const tryClear = () => {
		if (target.dataset.hydrated === 'true') {
			clearFailedChunkReloadMarker(storage);
			stop();
			return true;
		}
		return false;
	};
	if (tryClear()) return () => {};
	stop = observe(() => {
		tryClear();
	});
	return stop;
}
