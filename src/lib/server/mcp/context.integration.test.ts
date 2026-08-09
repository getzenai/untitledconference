import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { McpAuthError, resolveMcpContext } from './context';

const suffix = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

async function seedUser(
	key: string,
	overrides: { banned?: boolean; banExpiresAt?: Date | null } = {}
): Promise<string> {
	const id = `user-${key}-${suffix}`;
	await db.insert(user).values({
		id,
		email: `${id}@example.test`,
		emailVerified: false,
		role: 'user',
		banned: overrides.banned ?? false,
		banExpiresAt: overrides.banExpiresAt ?? null,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	createdUserIds.push(id);
	return id;
}

async function seedOrgWithMember(
	key: string,
	userId: string,
	membershipCreatedAt: Date
): Promise<string> {
	const orgId = `org-${key}-${suffix}`;
	await db
		.insert(organization)
		.values({ id: orgId, name: `Org ${key}`, slug: `${orgId}`, createdAt: new Date() });
	createdOrgIds.push(orgId);

	await db.insert(member).values({
		id: `member-${key}-${suffix}`,
		organizationId: orgId,
		userId,
		role: 'member',
		createdAt: membershipCreatedAt
	});
	return orgId;
}

afterAll(async () => {
	for (const id of createdUserIds) await db.delete(user).where(eq(user.id, id));
	for (const id of createdOrgIds) await db.delete(organization).where(eq(organization.id, id));
});

describe('resolveMcpContext', () => {
	it('rejects a token without a subject claim', async () => {
		await expect(resolveMcpContext({})).rejects.toMatchObject({
			name: 'McpAuthError',
			code: 'no_user'
		});
	});

	it('resolves the user and their default (oldest) organization', async () => {
		const userId = await seedUser('default');
		// Seeded newest-first so a query without the ordering picks the wrong org.
		const newer = await seedOrgWithMember('newer', userId, new Date('2026-01-01T00:00:00Z'));
		const older = await seedOrgWithMember('older', userId, new Date('2025-01-01T00:00:00Z'));

		const ctx = await resolveMcpContext({ sub: userId, azp: 'client-abc' });

		expect(ctx.organizationId).toBe(older);
		expect(ctx.organizationId).not.toBe(newer);
		expect(ctx).toMatchObject({ userId, clientId: 'client-abc' });
	});

	it('leaves clientId undefined when the token carries no azp claim', async () => {
		const userId = await seedUser('no-azp');
		await seedOrgWithMember('no-azp', userId, new Date('2025-01-01T00:00:00Z'));

		const ctx = await resolveMcpContext({ sub: userId });

		expect(ctx.clientId).toBeUndefined();
	});

	it('distinguishes a user without an organization from a deleted one', async () => {
		const userId = await seedUser('orgless');

		// The two cases need different fixes (join an org vs. re-authenticate), and
		// the route maps them to different HTTP statuses.
		await expect(resolveMcpContext({ sub: userId })).rejects.toMatchObject({
			code: 'no_organization'
		});
		await expect(resolveMcpContext({ sub: `user-ghost-${suffix}` })).rejects.toMatchObject({
			code: 'no_user'
		});
	});

	it('rejects a banned user even though the access token is still valid', async () => {
		// Bans must take effect before the token expires, or a ban is up to an hour late.
		const userId = await seedUser('banned', { banned: true });
		await seedOrgWithMember('banned', userId, new Date('2025-01-01T00:00:00Z'));

		const rejection = resolveMcpContext({ sub: userId });
		await expect(rejection).rejects.toBeInstanceOf(McpAuthError);
		await expect(rejection).rejects.toMatchObject({ code: 'no_user' });
	});

	it('rejects a banned user who has no organization', async () => {
		// The orgless branch runs its own ban check; without it a banned user with
		// no membership would leak the "join an organization" hint instead.
		const userId = await seedUser('banned-orgless', { banned: true });

		await expect(resolveMcpContext({ sub: userId })).rejects.toMatchObject({ code: 'no_user' });
	});

	it('lets a user back in once their temporary ban has expired', async () => {
		const userId = await seedUser('ban-expired', {
			banned: true,
			banExpiresAt: new Date(Date.now() - 60_000)
		});
		const orgId = await seedOrgWithMember('ban-expired', userId, new Date('2025-01-01T00:00:00Z'));

		const ctx = await resolveMcpContext({ sub: userId });

		expect(ctx.organizationId).toBe(orgId);
	});
});
