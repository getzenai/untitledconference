import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Get current user from locals (already validated by layout)
	const currentUser = locals.user;

	// Fetch ALL users with their organization memberships
	// Client-side search will handle filtering
	const usersWithOrgs = await db
		.select({
			userId: schema.user.id,
			userName: schema.user.name,
			userEmail: schema.user.email,
			userRole: schema.user.role,
			userBanned: schema.user.banned,
			userBanReason: schema.user.banReason,
			userCreatedAt: schema.user.createdAt,
			userEmailVerified: schema.user.emailVerified,
			orgId: schema.organization.id,
			orgName: schema.organization.name,
			orgSlug: schema.organization.slug,
			memberRole: schema.member.role
		})
		.from(schema.user)
		.leftJoin(schema.member, eq(schema.user.id, schema.member.userId))
		.leftJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id));

	// Group by user and collect their organizations
	const userMap = new Map();

	for (const row of usersWithOrgs) {
		if (!userMap.has(row.userId)) {
			userMap.set(row.userId, {
				id: row.userId,
				name: row.userName,
				email: row.userEmail,
				role: row.userRole,
				banned: row.userBanned,
				banReason: row.userBanReason,
				createdAt: row.userCreatedAt,
				emailVerified: row.userEmailVerified,
				organizations: []
			});
		}

		if (row.orgId && row.orgName) {
			userMap.get(row.userId).organizations.push({
				id: row.orgId,
				name: row.orgName,
				slug: row.orgSlug,
				memberRole: row.memberRole
			});
		}
	}

	const users = Array.from(userMap.values());

	// Calculate stats
	const stats = {
		totalUsers: users.length,
		bannedUsers: users.filter((u) => u.banned).length,
		adminUsers: users.filter((u) => u.role === 'admin').length
	};

	return {
		currentUser,
		users,
		stats
	};
};
