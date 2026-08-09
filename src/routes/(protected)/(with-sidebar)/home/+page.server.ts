import { onboardingAuthApi } from '$lib/server/onboarding/auth-api';
import {
	getOnboardingState,
	ONBOARDING_CREATE_ORGANIZATION_PATH,
	ONBOARDING_INVITATIONS_PATH
} from '$lib/server/onboarding/status';
import type { PageServerLoad } from './$types';

/**
 * Surfaces what the user still has to do before the app is fully usable.
 *
 * Deliberately a prompt rather than a redirect: forcing every organization-less
 * user through onboarding would change the landing behaviour for existing
 * sessions and test fixtures. `resolveOnboardingRedirect` is available for
 * applications that do want to enforce it.
 */
export const load: PageServerLoad = async ({ request, locals }) => {
	if (!locals.user) {
		return { onboarding: null };
	}

	const state = await getOnboardingState(onboardingAuthApi, request.headers);

	if (state.isComplete) {
		return { onboarding: null };
	}

	return {
		onboarding: {
			pendingInvitationCount: state.pendingInvitations.length,
			hasOrganization: state.hasOrganization,
			href:
				state.pendingInvitations.length > 0
					? ONBOARDING_INVITATIONS_PATH
					: ONBOARDING_CREATE_ORGANIZATION_PATH
		}
	};
};
