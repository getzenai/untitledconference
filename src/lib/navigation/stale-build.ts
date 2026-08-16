/**
 * The decision a client has to make once its own build is no longer the one we
 * serve.
 *
 * A deploy replaces `_app/immutable/*`, hashed filenames and all. A tab that was
 * open while that happened still runs the old client, and SvelteKit resolves the
 * next route by importing a chunk from that vanished build. The import 404s, the
 * navigation stops, and — this is the part that makes it a bug rather than an
 * error — nothing is shown: no message, no spinner, the click simply does
 * nothing (#702).
 *
 * The way out is not to import at all. Hand the URL to the browser instead: a
 * real page load fetches fresh HTML, which references chunks that exist.
 *
 * Kept as a plain function, away from `beforeNavigate`, so the rule can be
 * tested as behaviour — old build plus a navigation equals a full page load —
 * rather than by reading the configuration back.
 */

/** The part of SvelteKit's `BeforeNavigate` this rule reads. */
export interface StaleBuildNavigation {
	/** True when the browser is leaving the app anyway (close, external link). */
	willUnload: boolean;
	to: { url: URL } | null;
}

/**
 * Sends `navigation` through a full page load when `isStale` says the running
 * build is gone. Returns whether it did, which is what the tests assert on.
 *
 * Two navigations are left alone:
 *
 * - `willUnload` ones. The browser is already doing a real load, or leaving; the
 *   old client is about to stop mattering either way.
 * - Ones without a target (`to === null`), which is how SvelteKit describes
 *   leaving to somewhere it does not control. There is no URL to load.
 */
export function reloadIfBuildIsStale(
	navigation: StaleBuildNavigation,
	isStale: boolean,
	load: (url: URL) => void
): boolean {
	if (!isStale || navigation.willUnload || !navigation.to) return false;

	load(navigation.to.url);
	return true;
}
