import { auth } from '$lib/auth';
import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import type { RequestHandler } from '@sveltejs/kit';

// OpenID Connect discovery document, served at the issuer (server) root.
export const GET: RequestHandler = ({ request }) =>
	oauthProviderOpenIdConfigMetadata(auth)(request);
