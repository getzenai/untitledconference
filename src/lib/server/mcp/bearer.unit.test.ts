import { describe, expect, it, vi } from 'vitest';

// Production semantics: under `vitest` `dev` is true, which is exactly the case
// that always worked. The bug only ever showed with dev === false.
vi.mock('$app/environment', () => ({ dev: false }));

vi.mock('$lib/auth', () => ({
	getServerOrigin: () => 'https://untitledconference.com',
	getMcpResource: () => 'https://untitledconference.com/api/v1/mcp'
}));

import { mcpVerifyOptions } from './bearer';

describe('mcpVerifyOptions', () => {
	it('fetches the JWKS over the public origin, not a loopback listener', () => {
		// Regression guard: the starter pointed this at http://127.0.0.1:$PORT.
		// On Workers there is no loopback listener, the fetch throws inside token
		// verification, and every authenticated call — including a bad token that
		// should be a 401 — surfaces as a 500.
		expect(mcpVerifyOptions().jwksUrl).toBe('https://untitledconference.com/api/auth/jwks');
	});

	it('binds tokens to the MCP resource and the tools scope', () => {
		const options = mcpVerifyOptions();
		expect(options.verifyOptions.audience).toBe('https://untitledconference.com/api/v1/mcp');
		expect(options.verifyOptions.issuer).toBe('https://untitledconference.com');
		expect(options.scopes).toEqual(['mcp:tools']);
	});
});
