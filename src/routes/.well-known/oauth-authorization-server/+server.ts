import { auth } from '$lib/auth';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import type { RequestHandler } from '@sveltejs/kit';

// RFC 8414 authorization server metadata. Served at the server root (not under
// /api/auth) because OAuth clients resolve it relative to the issuer origin.
export const GET: RequestHandler = ({ request }) => oauthProviderAuthServerMetadata(auth)(request);
