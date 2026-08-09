import { db } from '$lib/server/db';
import { member, user } from '$lib/server/db/auth-schema';
import { asc, eq } from 'drizzle-orm';

/** Per-request identity every MCP tool runs under. */
export interface McpContext {
	userId: string;
	organizationId: string;
	/**
	 * OAuth client id (`azp`) of the calling MCP client. Undefined when the token
	 * carries no `azp`. With dynamic client registration this is an opaque id
	 * minted per registration — it identifies a connection, not a vendor: two
	 * installs of the same client get two ids. Carried for logging only; it gates
	 * nothing, since access is already decided by the resolved user.
	 */
	clientId?: string;
}

export type McpAuthErrorCode = 'no_user' | 'no_organization';

/** Thrown when a verified JWT cannot be resolved to a user + organization. */
export class McpAuthError extends Error {
	constructor(
		public readonly code: McpAuthErrorCode,
		message: string
	) {
		super(message);
		this.name = 'McpAuthError';
	}
}

/**
 * Ordering that defines a user's DEFAULT organization: the OLDEST membership.
 * `member.id` breaks `createdAt` ties so the same user always resolves to the
 * same organization.
 */
export function defaultMembershipOrder() {
	return [asc(member.createdAt), asc(member.id)];
}

/**
 * Resolve the MCP request context from a verified OAuth JWT payload.
 *
 * `sub` is the Better Auth userId. The organization is the user's default
 * (oldest) membership, so MCP calls and web sessions agree on which tenant is
 * active. Banned users are rejected even while their token is still valid —
 * revocation must not wait for token expiry.
 *
 * A fork that lets a user bind a connection to a specific organization (for
 * example a picker on the consent screen, keyed by the token's `azp`) should
 * look that binding up here and fall back to this default.
 */
export async function resolveMcpContext(
	jwt: { sub?: string; azp?: string } & Record<string, unknown>
): Promise<McpContext> {
	const userId = jwt.sub;
	if (!userId) {
		throw new McpAuthError('no_user', 'Access token has no subject (sub) claim.');
	}

	const clientId = typeof jwt.azp === 'string' ? jwt.azp : undefined;

	// One query: default membership + ban state of the user in a single round trip.
	const [row] = await db
		.select({
			organizationId: member.organizationId,
			banned: user.banned,
			banExpiresAt: user.banExpiresAt
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.userId, userId))
		.orderBy(...defaultMembershipOrder())
		.limit(1);

	if (!row) {
		// No membership row — distinguish a deleted user from one without an org.
		const [existingUser] = await db
			.select({ banned: user.banned, banExpiresAt: user.banExpiresAt })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!existingUser) {
			throw new McpAuthError('no_user', 'The user for this access token no longer exists.');
		}
		assertNotBanned(existingUser);
		throw new McpAuthError(
			'no_organization',
			'This user is not a member of any organization. Create or join an organization first.'
		);
	}

	assertNotBanned(row);

	return { userId, organizationId: row.organizationId, clientId };
}

function assertNotBanned(row: { banned: boolean | null; banExpiresAt: Date | null }): void {
	if (row.banned && (!row.banExpiresAt || row.banExpiresAt.getTime() > Date.now())) {
		throw new McpAuthError('no_user', 'This account is banned.');
	}
}
