import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { McpContext } from '../context';
import { McpToolError, registerMcpTools, type AnyMcpToolDefinition } from '../tool-helpers';

/**
 * Example MCP tools. They exist to demonstrate the pattern rather than to be
 * useful: a tool declares a Zod input shape, returns a plain object, and reads
 * its identity from `ctx` — never from its arguments. Scoping every query by
 * `ctx.userId` / `ctx.organizationId` is what keeps one tenant's agent from
 * reaching another's data; an argument like `userId` would hand that decision
 * to the model.
 *
 * Replace these with your own domain tools.
 */
export function profileTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [getMyProfile(ctx), listMyOrganizations(ctx)];
}

export function registerProfileTools(server: McpServer, ctx: McpContext): void {
	registerMcpTools(server, ctx, profileTools(ctx));
}

function getMyProfile(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_my_profile',
		writes: false,
		description:
			'Get the profile of the authenticated user (the owner of the access token), ' +
			'including the organization this connection is acting on.',
		inputSchema: {},
		handler: async () => {
			const [row] = await db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					role: user.role,
					createdAt: user.createdAt
				})
				.from(user)
				.where(eq(user.id, ctx.userId))
				.limit(1);

			// The route resolved this user moments ago, so a miss means the account
			// was deleted mid-request. Surface it instead of returning a null profile.
			if (!row) {
				throw new McpToolError('Your user account no longer exists.');
			}

			return {
				...row,
				createdAt: row.createdAt.toISOString(),
				activeOrganizationId: ctx.organizationId
			};
		}
	};
}

function listMyOrganizations(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_my_organizations',
		writes: false,
		description:
			'List the organizations the authenticated user is a member of, oldest membership first, ' +
			'with the role held in each.',
		inputSchema: {
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.default(50)
				.describe('Maximum number of organizations to return (1-100).')
		},
		handler: async ({ limit }) => {
			const rows = await db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					role: member.role,
					joinedAt: member.createdAt
				})
				.from(member)
				.innerJoin(organization, eq(organization.id, member.organizationId))
				.where(eq(member.userId, ctx.userId))
				.orderBy(asc(member.createdAt), asc(member.id))
				.limit(limit);

			return {
				count: rows.length,
				activeOrganizationId: ctx.organizationId,
				organizations: rows.map((row) => ({ ...row, joinedAt: row.joinedAt.toISOString() }))
			};
		}
	};
}
