import { loadHomeDashboard } from '$lib/server/conference/home';
import { onboardingAuthApi } from '$lib/server/onboarding/auth-api';
import {
	getOnboardingState,
	ONBOARDING_CREATE_ORGANIZATION_PATH,
	ONBOARDING_INVITATIONS_PATH
} from '$lib/server/onboarding/status';
import type { PageServerLoad } from './$types';

/**
 * Post-login hub. Never redirects into a single conference — the user picks.
 *
 * Onboarding stays a prompt rather than a force: existing sessions and test
 * fixtures land here with a banner, not a hard redirect.
 */
export const load: PageServerLoad = async ({ request, locals }) => {
	if (!locals.user) {
		return {
			onboarding: null,
			hub: null
		};
	}

	const [state, hub] = await Promise.all([
		getOnboardingState(onboardingAuthApi, request.headers),
		loadHomeDashboard(locals.user.id)
	]);

	const onboarding = state.isComplete
		? null
		: {
				pendingInvitationCount: state.pendingInvitations.length,
				hasOrganization: state.hasOrganization,
				href:
					state.pendingInvitations.length > 0
						? ONBOARDING_INVITATIONS_PATH
						: ONBOARDING_CREATE_ORGANIZATION_PATH
			};

	return { onboarding, hub };
};
