import { auth, OAUTH_SCOPES } from '$lib/auth';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { beforeAll, describe, expect, it } from 'vitest';

const BASE_URL = 'http://localhost:5173';

function authRequest(path: string, init?: RequestInit) {
	return auth.handler(new Request(`${BASE_URL}/api/auth${path}`, init));
}

describe('Better Auth plugin wiring', () => {
	beforeAll(() => {
		if (!process.env.TEST_DATABASE_URL) {
			throw new Error('TEST_DATABASE_URL not configured for integration tests');
		}
	});

	it('serves a JWKS from the jwks table (jwt plugin)', async () => {
		const response = await authRequest('/jwks');
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(Array.isArray(body.keys)).toBe(true);
		expect(body.keys.length).toBeGreaterThan(0);
	});

	it('keeps the jwt plugin /token endpoint disabled', async () => {
		// Any session-cookie holder could otherwise mint a signed JWT outside the
		// OAuth consent flow.
		const response = await authRequest('/token');
		expect(response.status).toBe(404);
	});

	it('registers the passkey endpoints and requires a session for registration', async () => {
		const response = await authRequest('/passkey/generate-register-options');
		expect(response.status).not.toBe(404);
		expect(response.status).toBe(401);
	});

	it('advertises the configured OAuth scopes and endpoints (RFC 8414 metadata)', async () => {
		const response = await oauthProviderAuthServerMetadata(auth)(
			new Request(`${BASE_URL}/.well-known/oauth-authorization-server`)
		);
		expect(response.status).toBe(200);

		const metadata = await response.json();
		expect(metadata.scopes_supported).toEqual(OAUTH_SCOPES);
		expect(metadata.jwks_uri).toBe(`${BASE_URL}/api/auth/jwks`);
		expect(metadata.token_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/token`);
		// The issuer must be the bare origin, not the /api/auth basePath, so that
		// root-level discovery documents line up with the tokens we sign.
		expect(metadata.issuer).toBe(BASE_URL);
	});
});
