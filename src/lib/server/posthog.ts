import { env } from '$env/dynamic/public';
import type { EventName } from '$lib/analytics/event-names';
import { createLogger } from '$lib/server/logger';
import { PostHog } from 'posthog-node';

const logger = createLogger('PostHog');

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

let posthogClient: PostHog | null = null;

/**
 * Detects test runs so the client is never initialized under Vitest — otherwise
 * tests would emit events into the real PostHog project.
 */
function isTestEnvironment(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

/**
 * Returns the PostHog client, or null when analytics are not configured.
 *
 * Analytics are off by default: without `PUBLIC_POSTHOG_API_KEY` this returns
 * null and every helper below degrades to a no-op. Nothing here throws.
 */
export function getPostHogClient(): PostHog | null {
	if (posthogClient) return posthogClient;
	if (isTestEnvironment()) return null;

	const apiKey = env.PUBLIC_POSTHOG_API_KEY;
	if (!apiKey) {
		logger.debug('PostHog disabled: PUBLIC_POSTHOG_API_KEY not set');
		return null;
	}

	try {
		posthogClient = new PostHog(apiKey, {
			host: env.PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
			// Cache flags locally so evaluation does not add a network round-trip
			// to every request that checks one.
			featureFlagsPollingInterval: 300_000
		});
		logger.info('PostHog server client initialized');
		return posthogClient;
	} catch (error) {
		logger.error('Failed to initialize PostHog client', error);
		return null;
	}
}

/**
 * Evaluates a feature flag for a user.
 * Fails closed: returns false when PostHog is unavailable or errors.
 */
export async function getFeatureFlagForUser(
	flagKey: string,
	distinctId: string,
	personProperties?: Record<string, string>
): Promise<boolean> {
	const client = getPostHogClient();
	if (!client) return false;

	try {
		const isEnabled = await client.isFeatureEnabled(flagKey, distinctId, { personProperties });
		return isEnabled ?? false;
	} catch (error) {
		logger.error(`Error fetching feature flag '${flagKey}'`, error);
		return false;
	}
}

/** Associates properties with a user. No-op when PostHog is not configured. */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
	const client = getPostHogClient();
	if (!client) return;

	try {
		client.identify({ distinctId: userId, properties });
	} catch (error) {
		logger.error(`Error identifying user '${userId}'`, error);
	}
}

/** Associates a user with an organization group. No-op when not configured. */
export function groupUser(
	userId: string,
	organizationId: string,
	properties?: Record<string, unknown>
): void {
	const client = getPostHogClient();
	if (!client) return;

	try {
		client.groupIdentify({
			distinctId: userId,
			groupType: 'organization',
			groupKey: organizationId,
			properties
		});
	} catch (error) {
		logger.error('Error associating user with organization', error);
	}
}

/**
 * Captures a server-side event.
 *
 * @param groups Group associations (e.g. `{ organization: orgId }`). posthog-node
 *   does not attach groups automatically, so they must be passed per capture.
 */
export function captureEvent(
	distinctId: string,
	event: EventName,
	properties?: Record<string, unknown>,
	groups?: Record<string, string>
): void {
	const client = getPostHogClient();
	if (!client) return;

	try {
		client.capture({ distinctId, event, properties, groups });
	} catch (error) {
		logger.error(`Error capturing event '${event}'`, error);
	}
}

/**
 * Reports an exception to PostHog error tracking.
 * No-op when PostHog is not configured; never rethrows.
 */
export function captureException(
	error: Error,
	distinctId?: string,
	additionalProperties?: Record<string, unknown>
): void {
	const client = getPostHogClient();
	if (!client) return;

	try {
		client.captureException(error, distinctId, additionalProperties);
	} catch (captureError) {
		logger.error('Error capturing exception to PostHog', captureError);
	}
}

/**
 * Flushes buffered events and shuts the client down. Idempotent.
 *
 * @param timeoutMs Bounds the flush so shutdown cannot stall past a deploy's
 *   grace window (posthog-node defaults to 30s, which can exceed it).
 */
export async function shutdownPostHog(timeoutMs = 3000): Promise<void> {
	const client = posthogClient;
	if (!client) return;
	posthogClient = null;

	try {
		await client.shutdown(timeoutMs);
	} catch (error) {
		logger.error('Error shutting down PostHog client', error);
	}
}
