import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getMcpResource, getServerOrigin } from '$lib/auth';
import { mcpHandler } from '@better-auth/oauth-provider';
import { McpAuthError, resolveMcpContext, type McpContext } from './context';

/**
 * Same verification the MCP endpoint uses: OAuth bearer, audience `/api/v1/mcp`,
 * scope `mcp:tools`. REST is a second adapter, not a second key.
 */
export function mcpVerifyOptions() {
	const serverOrigin = getServerOrigin();
	const jwksUrl = dev
		? `${serverOrigin}/api/auth/jwks`
		: `http://127.0.0.1:${env.PORT || '3000'}/api/auth/jwks`;

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
