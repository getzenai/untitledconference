import { EventNames } from '$lib/analytics/event-names';
import { describe, expect, it } from 'vitest';
import {
	captureEvent,
	captureException,
	getFeatureFlagForUser,
	getPostHogClient,
	groupUser,
	identifyUser,
	shutdownPostHog
} from './posthog';

describe('server posthog', () => {
	it('never initializes a client in the test environment', () => {
		expect(getPostHogClient()).toBeNull();
	});

	it('degrades every capture helper to a no-op instead of throwing', () => {
		expect(() => identifyUser('u1', { email: 'a@b.test' })).not.toThrow();
		expect(() => groupUser('u1', 'org1')).not.toThrow();
		expect(() => captureEvent('u1', EventNames.USER_SIGNED_IN)).not.toThrow();
		expect(() => captureException(new Error('boom'), 'u1')).not.toThrow();
	});

	it('fails closed on feature flags when the client is unavailable', async () => {
		await expect(getFeatureFlagForUser('some-flag', 'u1')).resolves.toBe(false);
	});

	it('shuts down cleanly when no client was created', async () => {
		await expect(shutdownPostHog()).resolves.toBeUndefined();
	});
});
