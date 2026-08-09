import { env } from '$env/dynamic/private';
import { boolWithDefault } from '$lib/env/coerce';
import { error } from '@sveltejs/kit';

/**
 * Server-side feature flags.
 *
 * A flag is a single `FEATURE_*` environment variable that is off unless it is
 * explicitly set to "true"/"1" (case-insensitive, same coercion as the rest of
 * the environment registry). Add a flag by declaring it here and in
 * `src/lib/env/server-env-schema.ts`, so the inventory stays in one place.
 *
 * Values are read per call rather than cached, which keeps the module free of
 * module-scope env access (`vite build` runs without secrets — see CLAUDE.md).
 */
const FLAG_ENV_VARS = {
	/** Example flag shipped with the starter — replace with your own. */
	exampleFeature: 'FEATURE_EXAMPLE_FEATURE'
} as const;

export type FeatureFlag = keyof typeof FLAG_ENV_VARS;

const flagValue = boolWithDefault(false);

/** Whether a single flag is enabled. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
	return flagValue.parse(env[FLAG_ENV_VARS[flag]]);
}

/**
 * Guard for routes behind a flag. Throws a 404 (not a 403) so a disabled
 * feature is indistinguishable from a route that does not exist.
 */
export function ensureFeatureEnabled(flag: FeatureFlag): void {
	if (!isFeatureEnabled(flag)) {
		throw error(404, 'Not Found');
	}
}
