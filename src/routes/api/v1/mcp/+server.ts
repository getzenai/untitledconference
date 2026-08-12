import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getMcpResource, getServerOrigin } from '$lib/auth';
import { McpAuthError, resolveMcpContext } from '$lib/server/mcp/context';
import { registerAllTools, SERVER_INSTRUCTIONS } from '$lib/server/mcp/server';
import { mcpHandler } from '@better-auth/oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandler } from './$types';

/** RFC 6750 error response for tokens that verify but cannot be used. */
function bearerError(status: 401 | 403, error: string, description: string): Response {
	// Point at the same metadata document mcpHandler advertises on its own 401s,
	// so a client that gets this far can still discover the authorization server.
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

type Handler = (request: Request) => Promise<Response>;
let cachedHandler: Handler | undefined;

/**
 * Built on first request, not at module scope: getMcpResource() reads env vars
 * through the lazy config proxy, and `vite build` runs without an environment.
 */
function getHandler(): Handler {
	if (cachedHandler) return cachedHandler;

	const serverOrigin = getServerOrigin();

	// The JWKS endpoint lives in this same process, so verification must not
	// depend on the container being able to reach its own public origin — a proxy
	// hop, split-horizon DNS or a misconfigured BETTER_AUTH_URL would otherwise
	// break every token. In production (adapter-node) fetch it over loopback; in
	// dev the vite server origin already is the loopback.
	const jwksUrl = dev
		? `${serverOrigin}/api/auth/jwks`
		: `http://127.0.0.1:${env.PORT || '3000'}/api/auth/jwks`;

	// mcpHandler verifies the OAuth JWT (issued by the oauth-provider plugin,
	// signed via the jwt plugin) against our own JWKS, and emits the RFC 9728
	// WWW-Authenticate challenge on 401 so MCP clients can discover the auth
	// server. That challenge is the entry point of the whole OAuth flow.
	cachedHandler = mcpHandler(
		{
			verifyOptions: {
				issuer: serverOrigin,
				audience: getMcpResource()
			},
			// Tokens must carry the dedicated MCP scope; identity-only tokens are rejected.
			scopes: ['mcp:tools'],
			jwksUrl
		},
		async (req, jwt) => {
			let ctx;
			try {
				ctx = await resolveMcpContext(jwt);
			} catch (error) {
				if (error instanceof McpAuthError) {
					// 'no_user' → the token's subject is unusable (deleted or banned):
					// invalid_token per RFC 6750. 'no_organization' → the user exists but
					// lacks the membership this resource requires: insufficient_scope.
					return error.code === 'no_user'
						? bearerError(401, 'invalid_token', error.message)
						: bearerError(403, 'insufficient_scope', error.message);
				}
				throw error;
			}

			// Stateless mode: a fresh server + transport per request, with tools closed
			// over the caller's identity. No session state, so this stays correct
			// behind a load balancer and across restarts.
			const server = new McpServer(
				{ name: 'untitledconference', version: '1.0.0' },
				{ instructions: SERVER_INSTRUCTIONS }
			);
			registerAllTools(server, ctx);
			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true
			});
			await server.connect(transport);
			try {
				return await transport.handleRequest(req);
			} finally {
				// JSON-response mode: once handleRequest resolves, the response body is
				// complete, so the per-request pair can be torn down immediately rather
				// than lingering until GC. Teardown failures must not mask the response
				// (or the original error).
				transport.close().catch(() => {});
				server.close().catch(() => {});
			}
		}
	);

	return cachedHandler;
}

export const POST: RequestHandler = ({ request }) => getHandler()(request);

// Stateless server without server-initiated messages: the MCP streamable-HTTP
// spec permits 405 for GET (SSE stream) and DELETE (session teardown). Kept
// cheap — no auth, no DB, no McpServer.
const methodNotAllowed = () =>
	Response.json(
		{
			jsonrpc: '2.0',
			error: { code: -32000, message: 'Method not allowed. This MCP server only supports POST.' },
			id: null
		},
		{ status: 405, headers: { Allow: 'POST' } }
	);

export const GET: RequestHandler = () => methodNotAllowed();
export const DELETE: RequestHandler = () => methodNotAllowed();
