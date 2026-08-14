import { SESSION_COOKIE_CACHE_MAX_AGE_SECONDS } from '$lib/constants';

/**
 * The sentence the admin ban UI uses so the operator hears the cookieCache
 * window (#271) instead of "they are locked out now".
 *
 * Reads SESSION_COOKIE_CACHE_MAX_AGE_SECONDS. A hardcoded "5 minutes" here
 * would drift the day someone turns the constant under incident pressure.
 */
export function banTakesEffectCopy(seconds: number = SESSION_COOKIE_CACHE_MAX_AGE_SECONDS): string {
	return `A session already signed in stays valid for up to ${formatWindow(seconds)}.`;
}

function formatWindow(seconds: number): string {
	if (seconds % 60 === 0) {
		const minutes = seconds / 60;
		return minutes === 1 ? '1 minute' : `${minutes} minutes`;
	}
	return `${seconds} seconds`;
}
