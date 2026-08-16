/**
 * Canonical analytics event names.
 *
 * Kept free of any client-only import so the same constants can be used from
 * server-side capture (`$lib/server/posthog`) and browser tracking
 * (`$lib/analytics/posthog`). Add new events here rather than passing raw
 * strings at call sites — that keeps the PostHog event list from drifting.
 */
export const EventNames = {
	USER_SIGNED_UP: 'user_signed_up',
	USER_SIGNED_IN: 'user_signed_in',
	USER_SIGNED_OUT: 'user_signed_out',
	USER_EMAIL_VERIFIED: 'user_email_verified',
	USER_PASSWORD_RESET_REQUESTED: 'user_password_reset_requested',
	USER_PASSWORD_CHANGED: 'user_password_changed',

	ONBOARDING_STARTED: 'onboarding_started',
	ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
	ONBOARDING_COMPLETED: 'onboarding_completed',

	ORGANIZATION_CREATED: 'organization_created',
	ORGANIZATION_RENAMED: 'organization_renamed',
	ORGANIZATION_MEMBER_INVITED: 'organization_member_invited',
	ORGANIZATION_INVITATION_ACCEPTED: 'organization_invitation_accepted',
	ORGANIZATION_INVITATION_REJECTED: 'organization_invitation_rejected',
	ORGANIZATION_MEMBER_REMOVED: 'organization_member_removed',
	ORGANIZATION_MEMBER_ROLE_CHANGED: 'organization_member_role_changed',
	ORGANIZATION_OWNERSHIP_TRANSFERRED: 'organization_ownership_transferred',
	ORGANIZATION_LEFT: 'organization_left',
	ORGANIZATION_DELETED: 'organization_deleted'
} as const;

export type EventName = (typeof EventNames)[keyof typeof EventNames];
