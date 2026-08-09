import { createLogger } from '$lib/server/logger';

const logger = createLogger('Onboarding');

export const ONBOARDING_INVITATIONS_PATH = '/onboarding/invitations';
export const ONBOARDING_CREATE_ORGANIZATION_PATH = '/settings/organization/new';

export interface PendingInvitation {
	id: string;
	organizationId: string;
	organizationName: string;
	role: string;
	expiresAt: Date;
}

export interface OnboardingState {
	pendingInvitations: PendingInvitation[];
	hasOrganization: boolean;
	/** True once the user belongs to an organization and has nothing left to act on. */
	isComplete: boolean;
}

/**
 * The subset of better-auth's organization API this module needs.
 * Declared structurally so the logic can be unit tested without a database.
 */
export interface OnboardingAuthApi {
	listUserInvitations(args: { headers: Headers }): Promise<unknown>;
	listOrganizations(args: { headers: Headers }): Promise<unknown>;
}

function asString(value: unknown, fallback: string): string {
	return typeof value === 'string' && value ? value : fallback;
}

/**
 * Narrows one entry of better-auth's invitation list, or returns null when it is
 * not something the user can act on.
 */
function toPendingInvitation(entry: unknown, now: number): PendingInvitation | null {
	if (!entry || typeof entry !== 'object') return null;

	const invitation = entry as Record<string, unknown>;
	if (invitation.status !== 'pending') return null;

	// Drop unparseable and already-expired invitations — accepting them would
	// fail anyway, so they must not be offered to the user.
	const expiresAt = new Date(invitation.expiresAt as string | number | Date);
	if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) return null;

	const id = asString(invitation.id, '');
	const organizationId = asString(invitation.organizationId, '');
	if (!id || !organizationId) return null;

	return {
		id,
		organizationId,
		organizationName: asString(invitation.organizationName, 'this organization'),
		role: asString(invitation.role, 'member'),
		expiresAt
	};
}

function toPendingInvitations(raw: unknown): PendingInvitation[] {
	if (!Array.isArray(raw)) return [];

	const now = Date.now();

	return raw
		.map((entry) => toPendingInvitation(entry, now))
		.filter((invitation): invitation is PendingInvitation => invitation !== null);
}

/**
 * Reads what the signed-in user still has to do before the app is usable:
 * accept an invitation, or create an organization.
 *
 * Fails open — a transient auth or database error yields a "complete" state
 * rather than trapping the user behind an onboarding prompt they cannot clear.
 */
export async function getOnboardingState(
	api: OnboardingAuthApi,
	headers: Headers
): Promise<OnboardingState> {
	try {
		const [invitationsResult, organizationsResult] = await Promise.all([
			api.listUserInvitations({ headers }),
			api.listOrganizations({ headers })
		]);

		const pendingInvitations = toPendingInvitations(invitationsResult);
		const hasOrganization = Array.isArray(organizationsResult) && organizationsResult.length > 0;

		return {
			pendingInvitations,
			hasOrganization,
			isComplete: hasOrganization && pendingInvitations.length === 0
		};
	} catch (error) {
		logger.warn('Failed to resolve onboarding state, treating it as complete', error);
		return { pendingInvitations: [], hasOrganization: true, isComplete: true };
	}
}

/**
 * The next onboarding destination for a given state, or null when there is
 * nothing left to do. Pure, so callers decide whether to redirect or merely
 * prompt.
 */
export function resolveOnboardingRedirect(state: OnboardingState): string | null {
	if (state.pendingInvitations.length > 0) return ONBOARDING_INVITATIONS_PATH;
	if (!state.hasOrganization) return ONBOARDING_CREATE_ORGANIZATION_PATH;
	return null;
}
