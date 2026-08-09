import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, inferAdditionalFields, organizationClient } from 'better-auth/client/plugins'; // This plugin import might still be from /client/plugins
import { createAuthClient } from 'better-auth/svelte'; // Changed to /svelte as per SvelteKit docs
import type { auth } from './auth.ts'; // Adjusted path after moving file
import { organizationAccessControl, organizationRoles } from './auth/permissions';

export const authClient = createAuthClient({
	// baseURL can often be omitted if auth routes are on the same domain (e.g., /api/auth/*)
	// baseURL: process.env.BETTER_AUTH_URL, // Or use an env variable if needed for a separate auth server
	plugins: [
		inferAdditionalFields<typeof auth>(),
		// Same access control instance as the server plugin, so client-side
		// permission checks agree with what the server enforces.
		organizationClient({
			ac: organizationAccessControl,
			roles: organizationRoles
		}),
		adminClient(),
		passkeyClient(),
		// Forwards the signed OAuth authorization query (present on the login and
		// consent pages during an OAuth flow) with sign-in/consent requests so the
		// server can continue the authorization flow.
		oauthProviderClient()
	]
});

/**
 * WebAuthn error codes meaning the user dismissed the passkey dialog (or it
 * timed out) - expected outcomes, not errors to surface in the UI.
 * - ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY: simplewebauthn's mapping of
 *   NotAllowedError, the code raised when the user cancels the native dialog
 * - ERROR_CEREMONY_ABORTED: ceremony aborted via AbortSignal (superseded request)
 * - AUTH_CANCELLED: the passkey client's fallback code for non-WebAuthn throws
 */
export const PASSKEY_CANCELLED_CODES = [
	'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
	'ERROR_CEREMONY_ABORTED',
	'AUTH_CANCELLED'
];
