import { captureClientException } from '$lib/analytics/posthog';
import {
	clearMarkerOnceHydrated,
	shouldReloadFailedChunkOnce
} from '$lib/navigation/failed-chunk-reload';
import type { ClientInit, HandleClientError } from '@sveltejs/kit';

function sessionStore(): Storage | null {
	try {
		return sessionStorage;
	} catch {
		return null;
	}
}

/**
 * Drop the one-reload marker only after this document actually hydrated.
 * Clearing in `init` would erase it before the failed import runs again,
 * and the second pass would reload forever (#887).
 */
export const init: ClientInit = () => {
	const storage = sessionStore();
	if (!storage) return;
	clearMarkerOnceHydrated(storage, document.body, (onChange) => {
		const observer = new MutationObserver(onChange);
		observer.observe(document.body, { attributes: true, attributeFilter: ['data-hydrated'] });
		return () => observer.disconnect();
	});
};

/**
 * Reports unexpected client-side errors to PostHog error tracking.
 *
 * A no-op when analytics are not configured. Expected navigation outcomes
 * (404s) are skipped so they do not drown out real errors.
 *
 * A missing hashed chunk on first load is the deploy cutover (#887), not a
 * defect to show. Reload once. The second pass falls through to the error page.
 */
/**
 * `sessionStore()` guards *reading* the global. The write inside can throw on
 * its own: a full or locked store rejects `setItem` (#896). Letting that out
 * would be an exception raised inside the error handler — worse than the error
 * it was called to handle.
 *
 * Falling back to `false` and not to a reload is the deliberate half. A store
 * that cannot remember the first try cannot stop the second, and a reload
 * nobody counts is an unbounded one.
 */
function wantsFailedChunkReload(error: unknown): boolean {
	try {
		return shouldReloadFailedChunkOnce(error, sessionStore());
	} catch {
		return false;
	}
}

export const handleError: HandleClientError = ({ error, status, message, event }) => {
	if (wantsFailedChunkReload(error)) {
		location.reload();
		return { message };
	}

	if (status !== 404) {
		captureClientException(error, {
			status,
			pathname: event.url.pathname
		});
	}

	return { message };
};
