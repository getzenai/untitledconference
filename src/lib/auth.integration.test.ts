import { auth, firstOrganizationFor, OAUTH_SCOPES } from '$lib/auth';
import { db } from '$lib/server/db';
import { member, organization, session, user } from '$lib/server/db/auth-schema';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

/**
 * Which organization a session starts in.
 *
 * The pick has to be *deterministic*, not merely correct-looking. A user in two
 * organizations who lands in a different one depending on how the database felt
 * about row order is a bug that shows up once a week and never in a test — and
 * the seed writes memberships that share a timestamp, so the tiebreak is
 * load-bearing rather than theoretical.
 */
describe('firstOrganizationFor', () => {
	const suffix = `active-org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const joinerId = `joiner-${suffix}`;
	const loneId = `lone-${suffix}`;
	const newerOrgId = `org-newer-${suffix}`;
	const firstOldOrgId = `org-old-a-${suffix}`;
	const secondOldOrgId = `org-old-b-${suffix}`;

	/** One timestamp on two memberships, so `createdAt` alone cannot decide. */
	const sharedMoment = new Date('2027-01-01T09:00:00.000Z');

	beforeAll(async () => {
		await db.insert(organization).values([
			{ id: newerOrgId, name: 'Newer Org', slug: newerOrgId, createdAt: new Date() },
			{ id: firstOldOrgId, name: 'Old Org A', slug: firstOldOrgId, createdAt: new Date() },
			{ id: secondOldOrgId, name: 'Old Org B', slug: secondOldOrgId, createdAt: new Date() }
		]);

		await db.insert(user).values([
			{ id: joinerId, email: `${joinerId}@example.test`, emailVerified: true, name: 'Joiner' },
			{ id: loneId, email: `${loneId}@example.test`, emailVerified: true, name: 'Lone' }
		]);

		// Written newest-first on purpose: if the answer came from insertion order
		// instead of the ordering, this would pass for the wrong reason.
		await db.insert(member).values([
			{
				id: `m-c-newer-${suffix}`,
				organizationId: newerOrgId,
				userId: joinerId,
				role: 'member',
				createdAt: new Date('2027-06-01T09:00:00.000Z')
			},
			{
				id: `m-b-old-${suffix}`,
				organizationId: secondOldOrgId,
				userId: joinerId,
				role: 'member',
				createdAt: sharedMoment
			},
			{
				id: `m-a-old-${suffix}`,
				organizationId: firstOldOrgId,
				userId: joinerId,
				role: 'owner',
				createdAt: sharedMoment
			}
		]);
	});

	afterAll(async () => {
		await db.delete(member).where(eq(member.userId, joinerId));
		for (const id of [newerOrgId, firstOldOrgId, secondOldOrgId]) {
			await db.delete(organization).where(eq(organization.id, id));
		}
		await db.delete(user).where(eq(user.id, joinerId));
		await db.delete(user).where(eq(user.id, loneId));
	});

	it('picks the oldest membership, not the most recent one', async () => {
		// Two share the oldest timestamp, so the `id` tiebreak settles it:
		// `m-a-old-…` sorts ahead of `m-b-old-…`.
		expect(await firstOrganizationFor(joinerId)).toBe(firstOldOrgId);
	});

	it('gives the same answer every time', async () => {
		// The reason the tiebreak exists. Without it this is up to the query plan.
		const answers = new Set<string | null>();
		for (let i = 0; i < 5; i++) answers.add(await firstOrganizationFor(joinerId));
		expect(answers.size).toBe(1);
	});

	it('answers null for a user who belongs to nothing', async () => {
		// Not a failure: this is a fresh sign-up, and the caller leaves the session
		// without an organization so onboarding can take over.
		expect(await firstOrganizationFor(loneId)).toBeNull();
	});

	/**
	 * The helper being right is not the fix. The fix is that signing in puts its
	 * answer on the session — so this goes through Better Auth for real and then
	 * reads the row it wrote.
	 */
	describe('signing in', () => {
		const password = 'ActiveOrgProbe2027!';
		const memberEmail = `signin-member-${suffix}@example.test`;
		const loneEmail = `signin-lone-${suffix}@example.test`;

		/**
		 * Registers an account and signs in, returning the sign-in response.
		 *
		 * The `emailVerified` update in the middle is not a shortcut around the
		 * product rule — `REQUIRE_EMAIL_VERIFICATION` defaults to true and there is
		 * no mailbox here, so without it sign-in answers 403 and the session this
		 * test is about is never created.
		 */
		async function register(email: string) {
			await authRequest('/sign-up/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, name: 'Probe' })
			});

			await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));

			const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
			return account.id;
		}

		function signIn(email: string) {
			return authRequest('/sign-in/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
		}

		/** The `activeOrganizationId` on this user's newest session row. */
		async function storedActiveOrganization(userId: string) {
			const [row] = await db
				.select({ activeOrganizationId: session.activeOrganizationId })
				.from(session)
				.where(eq(session.userId, userId))
				.orderBy(desc(session.createdAt))
				.limit(1);

			return row?.activeOrganizationId ?? null;
		}

		afterAll(async () => {
			for (const email of [memberEmail, loneEmail]) {
				const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
				if (!account) continue;
				await db.delete(session).where(eq(session.userId, account.id));
				await db.delete(member).where(eq(member.userId, account.id));
				await db.delete(user).where(eq(user.id, account.id));
			}
		});

		it('puts the user\u2019s organization on the new session', async () => {
			const userId = await register(memberEmail);

			// The membership has to exist before the session is created — that is
			// the whole ordering the fix depends on.
			await db.insert(member).values({
				id: `seat-signin-${suffix}`,
				organizationId: firstOldOrgId,
				userId,
				role: 'owner',
				createdAt: new Date()
			});

			expect((await signIn(memberEmail)).status).toBe(200);
			expect(await storedActiveOrganization(userId)).toBe(firstOldOrgId);
		});

		it('leaves it empty for someone who belongs to nothing', async () => {
			// The onboarding case has to stay distinguishable from the healed one.
			const userId = await register(loneEmail);

			expect((await signIn(loneEmail)).status).toBe(200);
			expect(await storedActiveOrganization(userId)).toBeNull();
		});
	});
});
