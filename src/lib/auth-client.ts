import { adminClient, inferAdditionalFields, organizationClient } from 'better-auth/client/plugins'; // This plugin import might still be from /client/plugins
import { createAuthClient } from 'better-auth/svelte'; // Changed to /svelte as per SvelteKit docs
import type { auth } from './auth.ts'; // Adjusted path after moving file

export const authClient = createAuthClient({
	// baseURL can often be omitted if auth routes are on the same domain (e.g., /api/auth/*)
	// baseURL: process.env.BETTER_AUTH_URL, // Or use an env variable if needed for a separate auth server
	plugins: [inferAdditionalFields<typeof auth>(), organizationClient(), adminClient()]
});
