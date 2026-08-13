import { contextFromJwt, withMcpBearer } from '$lib/server/mcp/bearer';
import { registerAllTools, SERVER_INSTRUCTIONS } from '$lib/server/mcp/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandler } from './$types';

type Handler = (request: Request) => Promise<Response>;
let cachedHandler: Handler | undefined;

/**
 * Built on first request, not at module scope: getMcpResource() reads env vars
 * through the lazy config proxy, and `vite build` runs without an environment.
 */
function getHandler(): Handler {
	if (cachedHandler) return cachedHandler;

	// Same bearer verification as the REST adapter. The JWKS hop stays in
	// withMcpBearer so a proxy or split-horizon DNS cannot break token checks.
	cachedHandler = withMcpBearer(async (req, jwt) => {
		const ctxOrError = await contextFromJwt(jwt);
		if (ctxOrError instanceof Response) return ctxOrError;

		// Stateless mode: a fresh server + transport per request, with tools closed
		// over the caller's identity. No session state, so this stays correct
		// behind a load balancer and across restarts.
		const server = new McpServer(
			{ name: 'untitledconference', version: '1.0.0' },
			{ instructions: SERVER_INSTRUCTIONS }
		);
		registerAllTools(server, ctxOrError);
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
	});

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
