import { auth } from '$lib/auth';
import type { OnboardingAuthApi } from './status';

/**
 * Adapter binding better-auth's organization endpoints to the narrow interface
 * `getOnboardingState` consumes, so the status logic stays unit testable.
 */
export const onboardingAuthApi: OnboardingAuthApi = {
	listUserInvitations: ({ headers }) => auth.api.listUserInvitations({ headers }),
	listOrganizations: ({ headers }) => auth.api.listOrganizations({ headers })
};
