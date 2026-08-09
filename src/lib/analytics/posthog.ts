import { browser } from '$app/environment';
import type { PostHog } from 'posthog-js';
import { EventNames, type EventName } from './event-names';

export { EventNames, type EventName };

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

type EventProperties = Record<string, unknown>;

/**
 * Browser analytics configuration, resolved on the server and handed to the
 * client through the root layout's data.
 *
 * It does not come from `$env/dynamic/public` in the browser: that module's
 * client shim dereferences a global SvelteKit only populates inside `start()`,
 * so reading it from the entry bundle (which `src/hooks.client.ts` pulls this
 * module into) throws before the app boots. Passing it through layout data
 * works identically in dev, `vite preview` and production.
 */
export type AnalyticsConfig = {
	apiKey?: string;
	host?: string;
};

/**
 * The loaded PostHog instance, or null while analytics are disabled.
 *
 * posthog-js is imported dynamically so it stays out of the SSR path and out of
 * the initial client bundle when no key is configured.
 */
let posthog: PostHog | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initializes browser analytics.
 *
 * Off by default: without an API key this resolves without loading posthog-js
 * at all, and every helper below becomes a no-op. Safe to call more than once —
 * initialization happens exactly once.
 */
export async function initAnalytics(config: AnalyticsConfig): Promise<void> {
	if (!browser) return;
	if (initPromise) return initPromise;

	const apiKey = config.apiKey;
	if (!apiKey) return;

	initPromise = (async () => {
		try {
			const module = await import('posthog-js');
			const client = module.default;

			client.init(apiKey, {
				api_host: config.host || DEFAULT_POSTHOG_HOST,
				// Only create person profiles once a user is identified, so
				// anonymous traffic does not inflate the billed person count.
				person_profiles: 'identified_only',
				// SvelteKit navigations are client-side; pageviews are captured
				// explicitly from the root layout instead.
				capture_pageview: false,
				capture_pageleave: true
			});

			posthog = client;
		} catch (error) {
			// Analytics must never break the app shell.
			console.error('Failed to initialize PostHog', error);
			posthog = null;
		}
	})();

	return initPromise;
}

export function trackEvent(eventName: EventName, properties: EventProperties = {}): void {
	posthog?.capture(eventName, properties);
}

export function capturePageview(url?: string): void {
	posthog?.capture('$pageview', url ? { $current_url: url } : {});
}

export function identifyUser(userId: string, properties: EventProperties = {}): void {
	posthog?.identify(userId, properties);
}

/** Clears the current identity. Call on sign-out so the next user starts fresh. */
export function resetUser(): void {
	posthog?.reset();
}

/** Reports a client-side exception to PostHog error tracking. */
export function captureClientException(
	error: unknown,
	additionalProperties?: EventProperties
): void {
	if (!posthog) return;
	posthog.captureException(
		error instanceof Error ? error : new Error(String(error)),
		additionalProperties
	);
}
