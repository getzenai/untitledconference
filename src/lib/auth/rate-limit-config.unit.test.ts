import { describe, expect, it } from 'vitest';
import { buildRateLimitConfig } from './rate-limit-config';

describe('buildRateLimitConfig', () => {
	it('returns undefined (Better Auth defaults untouched) when RELAX_AUTH_RATE_LIMIT is unset', () => {
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: undefined })).toBeUndefined();
	});

	it('returns undefined for values that are not an explicit opt-in', () => {
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'false' })).toBeUndefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: '0' })).toBeUndefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'yes' })).toBeUndefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: '' })).toBeUndefined();
	});

	it('accepts "true" and "1", case-insensitively', () => {
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: '1' })).toBeDefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'true' })).toBeDefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'True' })).toBeDefined();
		expect(buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'TRUE' })).toBeDefined();
	});

	it('ignores ENABLE_TEST_ENDPOINTS — the preview-environment flag must not relax auth rate limits', () => {
		expect(
			buildRateLimitConfig({ ENABLE_TEST_ENDPOINTS: 'true' } as Record<string, string>)
		).toBeUndefined();
	});

	it('loosens only /sign-in* and /sign-up* via customRules when RELAX_AUTH_RATE_LIMIT=true', () => {
		const config = buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'true' });

		expect(config).toBeDefined();
		expect(config?.customRules).toEqual({
			'/sign-in/*': { window: 10, max: 1000 },
			'/sign-up/*': { window: 10, max: 1000 }
		});
	});

	it('does not disable rate limiting globally or touch enabled/storage/window/max', () => {
		const config = buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'true' });

		expect(config?.enabled).toBeUndefined();
		expect(config?.storage).toBeUndefined();
		expect(config?.window).toBeUndefined();
		expect(config?.max).toBeUndefined();
	});

	it('never relaxes password-reset or other sensitive paths', () => {
		const config = buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: 'true' });

		expect(Object.keys(config?.customRules ?? {})).toEqual(['/sign-in/*', '/sign-up/*']);
	});
});
