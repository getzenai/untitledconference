import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

import { ensureFeatureEnabled, isFeatureEnabled } from './feature-flags';

describe('feature flags', () => {
	beforeEach(() => {
		for (const key of Object.keys(mockEnv)) delete mockEnv[key];
		delete process.env.FEATURE_EXAMPLE_FEATURE;
		delete process.env.FEATURE_INAPP_CHAT;
	});

	it('defaults to off when the variable is unset or blank', () => {
		expect(isFeatureEnabled('exampleFeature')).toBe(false);
		mockEnv.FEATURE_EXAMPLE_FEATURE = '';
		expect(isFeatureEnabled('exampleFeature')).toBe(false);
	});

	it('is on for "true"/"1", case-insensitively', () => {
		for (const value of ['true', 'TRUE', '1']) {
			mockEnv.FEATURE_EXAMPLE_FEATURE = value;
			expect(isFeatureEnabled('exampleFeature')).toBe(true);
		}
	});

	it('treats any other value as off', () => {
		mockEnv.FEATURE_EXAMPLE_FEATURE = 'yes';
		expect(isFeatureEnabled('exampleFeature')).toBe(false);
	});

	it('ensureFeatureEnabled throws 404 while the flag is off', () => {
		try {
			ensureFeatureEnabled('exampleFeature');
			expect.unreachable('expected a 404');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(isHttpError(err) && err.status).toBe(404);
		}
	});

	it('ensureFeatureEnabled passes once the flag is on', () => {
		mockEnv.FEATURE_EXAMPLE_FEATURE = 'true';
		expect(() => ensureFeatureEnabled('exampleFeature')).not.toThrow();
	});

	it('treats FEATURE_INAPP_CHAT as off until it is explicitly true', () => {
		expect(isFeatureEnabled('inAppChat')).toBe(false);
		mockEnv.FEATURE_INAPP_CHAT = 'true';
		expect(isFeatureEnabled('inAppChat')).toBe(true);
	});
});
