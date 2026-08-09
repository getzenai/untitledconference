import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/organization/access';

/**
 * Permission statement for the organization plugin. Starts from Better Auth's
 * built-in organization statements (organization / member / invitation / team /
 * ac) so the shipped endpoints keep working; add project-specific resources
 * here as the app grows.
 *
 * The same access control instance must be passed to both the server plugin
 * (src/lib/auth.ts) and the client plugin (src/lib/auth-client.ts), otherwise
 * client-side `hasPermission` checks silently disagree with the server.
 */
const statement = {
	...defaultStatements
} as const;

export const organizationAccessControl = createAccessControl(statement);

export const organizationOwnerRole = organizationAccessControl.newRole({
	organization: ['update', 'delete'],
	member: ['create', 'update', 'delete'],
	invitation: ['create', 'cancel'],
	team: ['create', 'update', 'delete'],
	ac: ['create', 'read', 'update', 'delete']
});

export const organizationAdminRole = organizationAccessControl.newRole({
	organization: ['update'],
	member: ['create', 'update', 'delete'],
	invitation: ['create', 'cancel'],
	team: ['create', 'update', 'delete'],
	ac: ['create', 'read', 'update', 'delete']
});

export const organizationMemberRole = organizationAccessControl.newRole({
	organization: [],
	member: [],
	invitation: ['create', 'cancel'],
	team: [],
	ac: ['read']
});

export const organizationRoles = {
	owner: organizationOwnerRole,
	admin: organizationAdminRole,
	member: organizationMemberRole
} as const;

export type OrganizationRole = keyof typeof organizationRoles;
