import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		impersonating: locals.impersonating,
		// Resolved here rather than read from `$env/dynamic/public` in the
		// browser — see the note on AnalyticsConfig in $lib/analytics/posthog.
		analytics: {
			apiKey: env.PUBLIC_POSTHOG_API_KEY,
			host: env.PUBLIC_POSTHOG_HOST
		}
	};
};
