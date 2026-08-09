import { db } from '$lib/server/db';
import {
	jwks,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	passkey,
	session,
	user
} from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const suffix = `ap3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userId = `user-${suffix}`;
const sessionId = `session-${suffix}`;
const clientId = `client-${suffix}`;

async function seedUser() {
	await db.insert(user).values({
		id: userId,
		email: `${userId}@example.test`,
		emailVerified: false,
		role: 'user',
		createdAt: new Date(),
		updatedAt: new Date()
	});
}

async function seedSession() {
	await db.insert(session).values({
		id: sessionId,
		userId,
		token: `token-${suffix}`,
		expiresAt: new Date(Date.now() + 3_600_000),
		createdAt: new Date(),
		updatedAt: new Date()
	});
}

async function seedClient() {
	await db.insert(oauthClient).values({
		id: `oauth-client-row-${suffix}`,
		clientId,
		name: 'Integration Test Client',
		redirectUris: ['https://client.example.test/callback'],
		scopes: ['openid', 'email']
	});
}

describe('auth schema: passkey / OAuth provider / JWKS tables', () => {
	beforeAll(() => {
		if (!process.env.TEST_DATABASE_URL) {
			throw new Error('TEST_DATABASE_URL not configured for integration tests');
		}
		expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
	});

	afterEach(async () => {
		// Deleting the user cascades to passkeys and OAuth rows; the client row is
		// removed explicitly because its FK to user is nullable.
		await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
		await db.delete(session).where(eq(session.id, sessionId));
		await db.delete(user).where(eq(user.id, userId));
		await db.delete(jwks).where(eq(jwks.id, `jwks-${suffix}`));
	});

	it('stores a passkey credential and cascades its deletion with the user', async () => {
		await seedUser();

		await db.insert(passkey).values({
			id: `passkey-${suffix}`,
			userId,
			publicKey: 'public-key',
			credentialID: `credential-${suffix}`,
			counter: 0,
			deviceType: 'singleDevice',
			backedUp: false
		});

		const stored = await db.select().from(passkey).where(eq(passkey.userId, userId));
		expect(stored).toHaveLength(1);
		expect(stored[0].credentialID).toBe(`credential-${suffix}`);

		await db.delete(user).where(eq(user.id, userId));
		expect(await db.select().from(passkey).where(eq(passkey.userId, userId))).toHaveLength(0);
	});

	it('holds a signature counter beyond the int4 range', async () => {
		await seedUser();

		const largeCounter = 4_294_967_295; // uint32 max — overflows int4
		await db.insert(passkey).values({
			id: `passkey-${suffix}`,
			userId,
			publicKey: 'public-key',
			credentialID: `credential-${suffix}`,
			counter: largeCounter,
			deviceType: 'singleDevice',
			backedUp: true
		});

		const [stored] = await db.select().from(passkey).where(eq(passkey.userId, userId));
		expect(stored.counter).toBe(largeCounter);
	});

	it('rejects two passkeys with the same credential id', async () => {
		await seedUser();

		const values = {
			userId,
			publicKey: 'public-key',
			credentialID: `credential-${suffix}`,
			counter: 0,
			deviceType: 'singleDevice',
			backedUp: false
		};

		await db.insert(passkey).values({ id: `passkey-a-${suffix}`, ...values });
		await expect(
			db.insert(passkey).values({ id: `passkey-b-${suffix}`, ...values })
		).rejects.toThrow();
	});

	it('cascades OAuth consents and tokens when the client is deleted', async () => {
		await seedUser();
		await seedSession();
		await seedClient();

		await db.insert(oauthConsent).values({
			id: `consent-${suffix}`,
			clientId,
			userId,
			scopes: ['openid', 'email']
		});
		await db.insert(oauthRefreshToken).values({
			id: `refresh-${suffix}`,
			token: `refresh-token-${suffix}`,
			clientId,
			sessionId,
			userId,
			scopes: ['openid', 'offline_access']
		});
		await db.insert(oauthAccessToken).values({
			id: `access-${suffix}`,
			token: `access-token-${suffix}`,
			clientId,
			sessionId,
			userId,
			refreshId: `refresh-${suffix}`,
			scopes: ['openid']
		});

		await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));

		expect(await db.select().from(oauthConsent).where(eq(oauthConsent.clientId, clientId))).toEqual(
			[]
		);
		expect(
			await db.select().from(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, clientId))
		).toEqual([]);
		expect(
			await db.select().from(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId))
		).toEqual([]);
	});

	it('nulls the session reference on OAuth tokens when the session is revoked', async () => {
		await seedUser();
		await seedSession();
		await seedClient();

		await db.insert(oauthRefreshToken).values({
			id: `refresh-${suffix}`,
			token: `refresh-token-${suffix}`,
			clientId,
			sessionId,
			userId,
			scopes: ['openid', 'offline_access']
		});

		await db.delete(session).where(eq(session.id, sessionId));

		const [stored] = await db
			.select()
			.from(oauthRefreshToken)
			.where(eq(oauthRefreshToken.id, `refresh-${suffix}`));
		expect(stored.sessionId).toBeNull();
	});

	it('stores JWKS key pairs for the jwt plugin', async () => {
		await db.insert(jwks).values({
			id: `jwks-${suffix}`,
			publicKey: '{"kty":"OKP"}',
			privateKey: 'encrypted-private-key',
			createdAt: new Date()
		});

		const [stored] = await db
			.select()
			.from(jwks)
			.where(eq(jwks.id, `jwks-${suffix}`));
		expect(stored.publicKey).toBe('{"kty":"OKP"}');
		expect(stored.expiresAt).toBeNull();
	});
});
