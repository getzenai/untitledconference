import { SESSION_FRESH_AGE_SECONDS } from '$lib/constants';

/**
 * Whether a session is still "fresh" enough for sensitive operations such as
 * passkey registration. Better Auth gates `/passkey/generate-register-options`
 * behind the same check (freshness measured from session creation, not last
 * activity), so we mirror it here to surface a re-auth prompt up front instead
 * of letting the WebAuthn ceremony fail with SESSION_NOT_FRESH.
 */
export function isSessionFresh(
	sessionCreatedAt: Date | string | null | undefined,
	now: number = Date.now(),
	freshAgeSeconds: number = SESSION_FRESH_AGE_SECONDS
): boolean {
	// freshAge of 0 disables the check entirely (matches Better Auth semantics).
	if (freshAgeSeconds === 0) return true;
	if (!sessionCreatedAt) return false;

	const createdAt =
		sessionCreatedAt instanceof Date
			? sessionCreatedAt.getTime()
			: new Date(sessionCreatedAt).getTime();
	if (Number.isNaN(createdAt)) return false;

	return now - createdAt < freshAgeSeconds * 1000;
}
