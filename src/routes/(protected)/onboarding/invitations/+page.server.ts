import { EventNames } from '$lib/analytics/event-names';
import { auth } from '$lib/auth';
import { createLogger } from '$lib/server/logger';
import { onboardingAuthApi } from '$lib/server/onboarding/auth-api';
import {
	getOnboardingState,
	ONBOARDING_CREATE_ORGANIZATION_PATH,
	resolveOnboardingRedirect
} from '$lib/server/onboarding/status';
import { captureEvent } from '$lib/server/posthog';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const logger = createLogger('OnboardingInvitations');

export const load: PageServerLoad = async ({ request, locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const state = await getOnboardingState(onboardingAuthApi, request.headers);

	// Nothing to act on — send the user wherever they belong next.
	if (state.pendingInvitations.length === 0) {
		throw redirect(303, state.hasOrganization ? '/home' : ONBOARDING_CREATE_ORGANIZATION_PATH);
	}

	return {
		invitations: state.pendingInvitations.map((invitation) => ({
			id: invitation.id,
			organizationName: invitation.organizationName,
			role: invitation.role,
			expiresAt: invitation.expiresAt.toISOString()
		}))
	};
};

/** Where to send the user once no invitation is left to answer. */
async function nextDestination(headers: Headers): Promise<string> {
	const state = await getOnboardingState(onboardingAuthApi, headers);
	return resolveOnboardingRedirect(state) ?? '/home';
}

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId');

		if (typeof invitationId !== 'string' || !invitationId) {
			return fail(400, { error: 'Missing invitation' });
		}

		let destination: string;
		try {
			const result = await auth.api.acceptInvitation({
				headers: request.headers,
				body: { invitationId }
			});

			const organizationId = result?.member?.organizationId;
			if (organizationId) {
				await auth.api.setActiveOrganization({
					headers: request.headers,
					body: { organizationId }
				});
				captureEvent(
					locals.user.id,
					EventNames.ORGANIZATION_INVITATION_ACCEPTED,
					{ organizationId },
					{ organization: organizationId }
				);
			}

			destination = await nextDestination(request.headers);
		} catch (error) {
			logger.error('Failed to accept invitation', error, { invitationId });
			return fail(500, { error: 'Failed to accept invitation' });
		}

		throw redirect(303, destination);
	},

	decline: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId');

		if (typeof invitationId !== 'string' || !invitationId) {
			return fail(400, { error: 'Missing invitation' });
		}

		let destination: string;
		try {
			await auth.api.rejectInvitation({
				headers: request.headers,
				body: { invitationId }
			});

			captureEvent(locals.user.id, EventNames.ORGANIZATION_INVITATION_REJECTED);

			destination = await nextDestination(request.headers);
		} catch (error) {
			logger.error('Failed to decline invitation', error, { invitationId });
			return fail(500, { error: 'Failed to decline invitation' });
		}

		throw redirect(303, destination);
	}
};
