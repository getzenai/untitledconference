import { getMcpResource, getServerOrigin } from '$lib/auth';
import { mcpHandler } from '@better-auth/oauth-provider';
import { McpAuthError, resolveMcpContext, type McpContext } from './context';

/**
 * Same verification the MCP endpoint uses: OAuth bearer, audience `/api/v1/mcp`,
 * scope `mcp:tools`. REST is a second adapter, not a second key.
 */
export function mcpVerifyOptions() {
	const serverOrigin = getServerOrigin();
	// The public URL, in dev and in production alike. The starter pointed this at
	// `http://127.0.0.1:$PORT` to save a hop on a Node container; on Workers there
	// is no loopback listener, the fetch throws, and every verified request — even
	// a bad token that should be a 401 — comes back as a 500. This is also what
	// better-auth computes by default from the auth server's baseURL.
	const jwksUrl = `${serverOrigin}/api/auth/jwks`;

	return {
		verifyOptions: {
			issuer: serverOrigin,
			audience: getMcpResource()
		},
		scopes: ['mcp:tools'],
		jwksUrl
	};
}

/** RFC 6750 error response for tokens that verify but cannot be used. */
export function bearerError(status: 401 | 403, error: string, description: string): Response {
	const resourceMetadataUrl = `${getServerOrigin()}/.well-known/oauth-protected-resource/api/v1/mcp`;
	return Response.json(
		{ error, error_description: description },
		{
			status,
			headers: {
				'WWW-Authenticate': `Bearer error="${error}", error_description="${description}", resource_metadata="${resourceMetadataUrl}"`
			}
		}
	);
}

export async function contextFromJwt(
	jwt: { sub?: string; azp?: string } & Record<string, unknown>
): Promise<McpContext | Response> {
	try {
		return await resolveMcpContext(jwt);
	} catch (error) {
		if (error instanceof McpAuthError) {
			return error.code === 'no_user'
				? bearerError(401, 'invalid_token', error.message)
				: bearerError(403, 'insufficient_scope', error.message);
		}
		throw error;
	}
}

export function withMcpBearer(
	handler: (
		req: Request,
		jwt: { sub?: string; azp?: string } & Record<string, unknown>
	) => Promise<Response>
): (req: Request) => Promise<Response> {
	return mcpHandler(mcpVerifyOptions(), handler);
}
