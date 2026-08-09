import type { BetterAuthRateLimitOptions } from 'better-auth';

/**
 * Better Auth's default special rule for `/sign-in*`/`/sign-up*` allows only
 * 3 requests per 10s per client IP (better-auth 1.6.x,
 * src/api/rate-limiter/index.ts `getDefaultSpecialRules()`), and rate limiting
 * itself defaults to enabled whenever `NODE_ENV=production`
 * (`@better-auth/core` `isProduction`).
 *
 * E2E runs serve the app from a production build, so `NODE_ENV` is
 * `production` there too. Behind a preview server Better Auth cannot resolve a
 * trusted client IP (no forwarded-header/proxy config) and falls back to a
 * single shared bucket for the whole path — every login in the run then draws
 * from the same 3-per-10s allowance and the 4th+ login within a 10s window
 * gets a 429.
 *
 * Loosen only `/sign-in*` and `/sign-up*`, gated by the dedicated
 * `RELAX_AUTH_RATE_LIMIT` variable. This is deliberately NOT keyed off
 * `ENABLE_TEST_ENDPOINTS`: that flag is also meant to be set in
 * internet-facing preview environments, and relaxing sign-in rate limits there
 * would open the door to password brute-force. When `RELAX_AUTH_RATE_LIMIT` is
 * off this returns `undefined`, leaving Better Auth's rate limiting exactly at
 * its defaults.
 */
export function buildRateLimitConfig(env: {
	RELAX_AUTH_RATE_LIMIT?: string;
}): BetterAuthRateLimitOptions | undefined {
	const normalized = env.RELAX_AUTH_RATE_LIMIT?.toLowerCase();
	if (normalized !== 'true' && normalized !== '1') {
		return undefined;
	}

	return {
		customRules: {
			'/sign-in/*': { window: 10, max: 1000 },
			'/sign-up/*': { window: 10, max: 1000 }
		}
	};
}
