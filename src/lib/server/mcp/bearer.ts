import { auth, getMcpResource, getServerOrigin } from '$lib/auth';
import { verifyJwsAccessToken } from 'better-auth/oauth2';
import { McpAuthError, resolveMcpContext, type McpContext } from './context';

/** The key-set shape better-auth verifies against, without importing `jose` here. */
type Jwks = NonNullable<
	Awaited<
		ReturnType<Extract<Parameters<typeof verifyJwsAccessToken>[1]['jwksFetch'], () => unknown>>
	>
>;

/** Scope every MCP/REST caller must carry. */
const REQUIRED_SCOPES = ['mcp:tools'];

/**
 * Stable identity for better-auth's JWKS cache. `jwksFetch` is a closure, so
 * without a key object the key set would be read on every single request.
 */
const JWKS_CACHE_KEY = {};

/**
 * Same verification the MCP endpoint uses: OAuth bearer, audience `/api/v1/mcp`,
 * scope `mcp:tools`. REST is a second adapter, not a second key.
 */
export function mcpVerifyOptions() {
	const serverOrigin = getServerOrigin();

	// The key set is read straight from our own database — the same rows
	// /api/auth/jwks publishes — instead of being fetched over HTTP. On Workers
	// a fetch of our own hostname re-enters the same script and fails ("Jwks
	// failed: <none>"), which turned every authenticated call into a 500. There
	// is no reason to leave the isolate for a value that is one query away.
	return {
		verifyOptions: {
			issuer: serverOrigin,
			audience: getMcpResource()
		},
		scopes: REQUIRED_SCOPES,
		jwksFetch: async (): Promise<Jwks> => (await auth.api.getJwks()) as Jwks,
		jwksCacheKey: JWKS_CACHE_KEY
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
	return async (req: Request) => {
		const header = req.headers.get('authorization') ?? '';
		const token = /^Bearer (.+)$/i.exec(header.trim())?.[1];
		if (!token) {
			return bearerError(401, 'invalid_token', 'missing authorization header');
		}

		const { verifyOptions, scopes, jwksFetch, jwksCacheKey } = mcpVerifyOptions();

		let payload: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
		try {
			payload = await verifyJwsAccessToken(token, { verifyOptions, jwksFetch, jwksCacheKey });
		} catch (error) {
			// Anything that stops a token from verifying is the caller's problem, not
			// ours: expired, wrong audience, wrong signature, not a JWT at all. All of
			// it is a 401 with a readable body — never an "Internal Error". JOSE's
			// error name is checked rather than its class so `jose` stays a transitive
			// dependency of better-auth instead of one we import directly.
			const expired = error instanceof Error && error.name === 'JWTExpired';
			return bearerError(401, 'invalid_token', expired ? 'token expired' : 'invalid access token');
		}

		const granted = new Set(typeof payload.scope === 'string' ? payload.scope.split(' ') : []);
		const missing = scopes.find((scope) => !granted.has(scope));
		if (missing) {
			return bearerError(403, 'insufficient_scope', `invalid scope ${missing}`);
		}

		return handler(req, payload);
	};
}
