import { describe, expect, it, vi } from 'vitest';

// Production semantics: under `vitest` `dev` is true, which is exactly the case
// that always worked. The bug only ever showed with dev === false.
vi.mock('$app/environment', () => ({ dev: false }));

const { getJwks } = vi.hoisted(() => ({
	getJwks: vi.fn(async () => ({ keys: [{ kid: 'k1', kty: 'OKP' }] }))
}));

vi.mock('$lib/auth', () => ({
	getServerOrigin: () => 'https://untitledconference.com',
	getMcpResource: () => 'https://untitledconference.com/api/v1/mcp',
	auth: { api: { getJwks } }
}));

import { bearerError, mcpVerifyOptions, withMcpBearer } from './bearer';

describe('mcpVerifyOptions', () => {
	it('reads the JWKS locally instead of fetching it over the network', async () => {
		// Regression guard, twice over: the starter fetched http://127.0.0.1:$PORT,
		// and fetching our own public origin re-enters the same Worker and throws
		// ("Jwks failed: <none>"). Either way every authenticated call became a 500.
		const options = mcpVerifyOptions();
		expect(options).not.toHaveProperty('jwksUrl');
		expect(await options.jwksFetch()).toEqual({ keys: [{ kid: 'k1', kty: 'OKP' }] });
		expect(getJwks).toHaveBeenCalled();
	});

	it('caches the key set under a stable key, not a per-request closure', () => {
		expect(mcpVerifyOptions().jwksCacheKey).toBe(mcpVerifyOptions().jwksCacheKey);
	});

	it('binds tokens to the MCP resource and the tools scope', () => {
		const options = mcpVerifyOptions();
		expect(options.verifyOptions.audience).toBe('https://untitledconference.com/api/v1/mcp');
		expect(options.verifyOptions.issuer).toBe('https://untitledconference.com');
		expect(options.scopes).toEqual(['mcp:tools']);
	});
});

describe('withMcpBearer', () => {
	const handler = withMcpBearer(async () => new Response('ok'));

	it('answers a missing bearer with 401 and the discovery pointer', async () => {
		const response = await handler(new Request('https://untitledconference.com/api/v1/mcp'));
		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toContain(
			'resource_metadata="https://untitledconference.com/.well-known/oauth-protected-resource/api/v1/mcp"'
		);
	});

	it('answers an unverifiable token with 401, never a 500', async () => {
		// The whole point of the fix: a token that cannot be verified is the
		// caller's problem and must come back readable.
		const response = await handler(
			new Request('https://untitledconference.com/api/v1/mcp', {
				headers: { authorization: 'Bearer not-a-jwt' }
			})
		);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: 'invalid_token' });
	});
});

describe('bearerError', () => {
	it('carries the RFC 6750 fields in body and header', async () => {
		const response = bearerError(403, 'insufficient_scope', 'invalid scope mcp:tools');
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: 'insufficient_scope',
			error_description: 'invalid scope mcp:tools'
		});
	});
});
