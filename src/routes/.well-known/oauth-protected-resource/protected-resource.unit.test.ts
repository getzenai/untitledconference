import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://app.example.com';

// Mock the auth module: the real one instantiates Better Auth (and therefore the
// database and env config) on first property access.
vi.mock('$lib/auth', () => ({
	getServerOrigin: () => ORIGIN,
	getMcpResource: () => `${ORIGIN}/api/v1/mcp`,
	OAUTH_SCOPES: ['openid', 'profile', 'email', 'offline_access', 'mcp:tools']
}));

import { GET } from './+server';
import { GET as GET_SUFFIXED } from './api/v1/mcp/+server';

type Metadata = {
	resource: string;
	authorization_servers: string[];
	bearer_methods_supported: string[];
	scopes_supported: string[];
};

async function fetchMetadata(handler: typeof GET, path: string): Promise<Response> {
	// The handler ignores the event; only the request shape matters here.
	return (await handler({
		request: new Request(`${ORIGIN}${path}`)
	} as never)) as Response;
}

describe('RFC 9728 protected resource metadata', () => {
	it('advertises the MCP endpoint as the resource and this server as its authorization server', async () => {
		const response = await fetchMetadata(GET, '/.well-known/oauth-protected-resource');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');

		const metadata = (await response.json()) as Metadata;
		// A client reads `resource` to know which audience to request a token for,
		// and `authorization_servers` to know where to run the OAuth flow.
		expect(metadata.resource).toBe(`${ORIGIN}/api/v1/mcp`);
		expect(metadata.authorization_servers).toEqual([ORIGIN]);
		expect(metadata.bearer_methods_supported).toEqual(['header']);
	});

	it('advertises mcp:tools, the scope the MCP endpoint requires', async () => {
		const response = await fetchMetadata(GET, '/.well-known/oauth-protected-resource');
		const metadata = (await response.json()) as Metadata;

		// Without this a client would request identity-only scopes and get a token
		// that /api/v1/mcp rejects, with nothing in the metadata explaining why.
		expect(metadata.scopes_supported).toContain('mcp:tools');
	});

	it('serves the same document at the path-suffixed variant the 401 challenge points at', async () => {
		// The WWW-Authenticate challenge from /api/v1/mcp advertises
		// /.well-known/oauth-protected-resource/api/v1/mcp. If only the bare path
		// were served, every client would 404 on discovery.
		const [root, suffixed] = await Promise.all([
			fetchMetadata(GET, '/.well-known/oauth-protected-resource'),
			fetchMetadata(GET_SUFFIXED, '/.well-known/oauth-protected-resource/api/v1/mcp')
		]);

		expect(suffixed.status).toBe(200);
		expect(await suffixed.json()).toEqual(await root.json());
	});
});
