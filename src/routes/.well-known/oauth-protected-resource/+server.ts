import { getMcpResource, getServerOrigin, OAUTH_SCOPES } from '$lib/auth';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

/**
 * RFC 9728 protected resource metadata for the MCP endpoint.
 *
 * This is the document an MCP client fetches after /api/v1/mcp answers 401 with
 * `WWW-Authenticate: Bearer resource_metadata="..."`. It tells the client which
 * authorization server to run the OAuth flow against, which is how a client
 * bootstraps from nothing but the MCP URL.
 *
 * Served at both the bare path and the path-suffixed variant
 * (/.well-known/oauth-protected-resource/api/v1/mcp), because the challenge
 * points at the latter — see that route.
 */
export const GET: RequestHandler = () =>
	json({
		resource: getMcpResource(),
		authorization_servers: [getServerOrigin()],
		bearer_methods_supported: ['header'],
		scopes_supported: OAUTH_SCOPES
	});
