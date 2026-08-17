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
export const handleError: HandleClientError = ({ error, status, message, event }) => {
	const storage = sessionStore();
	if (shouldReloadFailedChunkOnce(error, storage)) {
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
