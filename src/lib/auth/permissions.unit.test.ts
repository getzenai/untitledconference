import { defaultStatements } from 'better-auth/plugins/organization/access';
import { describe, expect, it } from 'vitest';
import {
	organizationAccessControl,
	organizationAdminRole,
	organizationMemberRole,
	organizationOwnerRole,
	organizationRoles
} from './permissions';

describe('organizationAccessControl', () => {
	it('exposes exactly the Better Auth organization statements', () => {
		expect(organizationAccessControl.statements).toEqual(defaultStatements);
	});

	it('defines a role for every value the organization plugin can store', () => {
		expect(Object.keys(organizationRoles).sort()).toEqual(['admin', 'member', 'owner']);
		expect(organizationRoles.owner).toBe(organizationOwnerRole);
		expect(organizationRoles.admin).toBe(organizationAdminRole);
		expect(organizationRoles.member).toBe(organizationMemberRole);
	});
});

describe('organizationOwnerRole', () => {
	it('can update and delete the organization', () => {
		expect(organizationOwnerRole.authorize({ organization: ['update'] }).success).toBe(true);
		expect(organizationOwnerRole.authorize({ organization: ['delete'] }).success).toBe(true);
	});

	it('can fully manage members, invitations and teams', () => {
		expect(
			organizationOwnerRole.authorize({ member: ['create', 'update', 'delete'] }).success
		).toBe(true);
		expect(organizationOwnerRole.authorize({ invitation: ['create', 'cancel'] }).success).toBe(
			true
		);
		expect(organizationOwnerRole.authorize({ team: ['create', 'update', 'delete'] }).success).toBe(
			true
		);
	});
});

describe('organizationAdminRole', () => {
	it('can update the organization', () => {
		expect(organizationAdminRole.authorize({ organization: ['update'] }).success).toBe(true);
	});

	it('cannot delete the organization — that stays with the owner', () => {
		const result = organizationAdminRole.authorize({ organization: ['delete'] });
		expect(result.success).toBe(false);
		expect(result.error).toContain('organization');
	});

	it('can manage members and invitations', () => {
		expect(
			organizationAdminRole.authorize({ member: ['create', 'update', 'delete'] }).success
		).toBe(true);
		expect(organizationAdminRole.authorize({ invitation: ['create', 'cancel'] }).success).toBe(
			true
		);
	});
});

describe('organizationMemberRole', () => {
	it('cannot update or delete the organization', () => {
		expect(organizationMemberRole.authorize({ organization: ['update'] }).success).toBe(false);
		expect(organizationMemberRole.authorize({ organization: ['delete'] }).success).toBe(false);
	});

	it('cannot manage members', () => {
		expect(organizationMemberRole.authorize({ member: ['create'] }).success).toBe(false);
		expect(organizationMemberRole.authorize({ member: ['update'] }).success).toBe(false);
		expect(organizationMemberRole.authorize({ member: ['delete'] }).success).toBe(false);
	});

	it('cannot manage teams', () => {
		expect(organizationMemberRole.authorize({ team: ['create'] }).success).toBe(false);
	});

	it('may invite teammates and cancel invitations', () => {
		expect(organizationMemberRole.authorize({ invitation: ['create', 'cancel'] }).success).toBe(
			true
		);
	});

	it('may read access-control config but not change it', () => {
		expect(organizationMemberRole.authorize({ ac: ['read'] }).success).toBe(true);
		expect(organizationMemberRole.authorize({ ac: ['create'] }).success).toBe(false);
		expect(organizationMemberRole.authorize({ ac: ['update'] }).success).toBe(false);
		expect(organizationMemberRole.authorize({ ac: ['delete'] }).success).toBe(false);
	});
});

describe('role escalation guards', () => {
	it('is strictly ordered owner > admin > member for organization management', () => {
		const canDeleteOrg = (role: {
			authorize: (r: Record<string, string[]>) => { success: boolean };
		}) => role.authorize({ organization: ['delete'] }).success;

		expect(canDeleteOrg(organizationOwnerRole)).toBe(true);
		expect(canDeleteOrg(organizationAdminRole)).toBe(false);
		expect(canDeleteOrg(organizationMemberRole)).toBe(false);
	});

	it('rejects unknown resources for every role', () => {
		for (const role of Object.values(organizationRoles)) {
			const result = role.authorize({ billing: ['read'] } as Record<string, string[]>);
			expect(result.success).toBe(false);
		}
	});

	it('requires every requested action to be allowed (AND semantics)', () => {
		// admin may update but not delete the organization: the combined request fails.
		expect(organizationAdminRole.authorize({ organization: ['update', 'delete'] }).success).toBe(
			false
		);
	});
});
