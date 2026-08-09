import { captureClientException } from '$lib/analytics/posthog';
import type { HandleClientError } from '@sveltejs/kit';

/**
 * Reports unexpected client-side errors to PostHog error tracking.
 *
 * A no-op when analytics are not configured. Expected navigation outcomes
 * (404s) are skipped so they do not drown out real errors.
 */
export const handleError: HandleClientError = ({ error, status, message, event }) => {
	if (status !== 404) {
		captureClientException(error, {
			status,
			pathname: event.url.pathname
		});
	}

	return { message };
};
