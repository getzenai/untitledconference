import { EventNames } from '$lib/analytics/event-names';
import { auth } from '$lib/auth';
import { createLogger } from '$lib/server/logger';
import { captureEvent } from '$lib/server/posthog';
import { transferOwnershipSafely } from '$lib/server/utils/organization-transfer';
import { renameOrganizationSchema } from '$lib/validators/organization';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const logger = createLogger('OrganizationSettings');

export const load: PageServerLoad = async ({ locals, request, params }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const { slug } = params;

	try {
		const headers = request.headers;

		// Get all organizations the user is a member of
		const organizations = await auth.api.listOrganizations({ headers });

		// Find the organization by slug
		const organization = organizations?.find((org) => org.slug === slug);

		if (!organization) {
			// Organization not found or user is not a member
			throw redirect(303, '/settings/organization');
		}

		// Get active member info to check if this is the active organization
		const activeMember = await auth.api.getActiveMember({ headers });

		// If this isn't the active organization, set it as active
		if (activeMember?.organizationId !== organization.id) {
			await auth.api.setActiveOrganization({
				headers,
				body: { organizationId: organization.id }
			});
		}

		// Get organization members
		const membersResponse = await auth.api.listMembers({
			headers,
			query: { organizationId: organization.id }
		});

		const members = membersResponse?.members || [];

		// Find current member info from the members list
		const currentMember = members.find((m) => m.userId === locals.user?.id) || {
			id: activeMember?.id,
			userId: locals.user?.id,
			organizationId: organization.id,
			role: activeMember?.role || 'member',
			user: locals.user
		};

		// Get invitations (only for admins/owners)
		let invitations: Array<Record<string, unknown>> = [];
		if (currentMember.role === 'admin' || currentMember.role === 'owner') {
			const allInvitations =
				(await auth.api.listInvitations({
					headers,
					query: { organizationId: organization.id }
				})) || [];

			// Filter out accepted invitations - only show pending ones
			invitations = allInvitations.filter((inv) => inv.status === 'pending');
		}

		return {
			organization,
			currentMember,
			members,
			invitations
		};
	} catch (error) {
		console.error('Error loading organization data:', error);
		throw redirect(303, '/settings/organization');
	}
};

export const actions: Actions = {
	renameOrganization: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const parsed = renameOrganizationSchema.safeParse({
			organizationId: formData.get('organizationId'),
			name: formData.get('name')
		});

		if (!parsed.success) {
			return fail(400, {
				error: parsed.error.issues[0]?.message ?? 'Invalid organization name'
			});
		}

		const { organizationId, name } = parsed.data;

		try {
			await auth.api.updateOrganization({
				headers: request.headers,
				body: { organizationId, data: { name } }
			});

			captureEvent(
				locals.user.id,
				EventNames.ORGANIZATION_RENAMED,
				{ organizationId },
				{ organization: organizationId }
			);

			return { success: true, renamed: true };
		} catch (error) {
			logger.error('Failed to rename organization', error, { organizationId });
			return fail(500, { error: 'Failed to rename organization' });
		}
	},

	inviteMember: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const email = formData.get('email') as string;
		const role = formData.get('role') as string;
		const organizationId = formData.get('organizationId') as string;

		if (!email || !role || !organizationId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			const invitation = await auth.api.createInvitation({
				headers: request.headers,
				body: {
					organizationId,
					email,
					role: role as 'member' | 'admin' | 'owner'
				}
			});

			return {
				success: true,
				invitationId: invitation.id
			};
		} catch (error) {
			console.error('Error inviting member:', error);
			return fail(500, { error: 'Failed to create invitation' });
		}
	},

	updateMemberRole: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const memberId = formData.get('memberId') as string;
		const role = formData.get('role') as string;
		const organizationId = formData.get('organizationId') as string;

		if (!memberId || !role || !organizationId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			await auth.api.updateMemberRole({
				headers: request.headers,
				body: {
					organizationId,
					memberId,
					role: role as 'member' | 'admin' | 'owner'
				}
			});

			return { success: true };
		} catch (error) {
			console.error('Error updating member role:', error);
			return fail(500, { error: 'Failed to update member role' });
		}
	},

	removeMember: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const memberId = formData.get('memberId') as string;
		const organizationId = formData.get('organizationId') as string;

		if (!memberId || !organizationId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			await auth.api.removeMember({
				headers: request.headers,
				body: { organizationId, memberIdOrEmail: memberId }
			});

			return { success: true };
		} catch (error) {
			console.error('Error removing member:', error);
			return fail(500, { error: 'Failed to remove member' });
		}
	},

	cancelInvitation: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Missing invitation ID' });
		}

		try {
			await auth.api.cancelInvitation({
				headers: request.headers,
				body: { invitationId }
			});

			return { success: true };
		} catch (error) {
			console.error('Error cancelling invitation:', error);
			return fail(500, { error: 'Failed to cancel invitation' });
		}
	},

	leaveOrganization: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const organizationId = formData.get('organizationId') as string;
		const newOwnerId = formData.get('newOwnerId') as string | null;

		if (!organizationId) {
			return fail(400, { error: 'Missing organization ID' });
		}

		try {
			// Get member info
			const activeMember = await auth.api.getActiveMember({
				headers: request.headers
			});

			// Check if user is actually a member of this organization
			if (!activeMember || activeMember.organizationId !== organizationId) {
				console.error('User is not a member of this organization');
				return fail(500, { error: 'Failed to leave organization' });
			}

			// Check if user is owner and needs to transfer ownership
			if (activeMember.role === 'owner') {
				const membersResponse = await auth.api.listMembers({
					headers: request.headers,
					query: { organizationId }
				});

				const otherMembers = (membersResponse?.members || []).filter(
					(m) => m.userId !== locals.user?.id
				);

				if (otherMembers.length > 0) {
					if (!newOwnerId) {
						return fail(400, {
							error: 'You must select a new owner before leaving',
							needsOwnerTransfer: true
						});
					}

					// Transfer ownership first
					await transferOwnershipSafely(
						auth,
						request.headers,
						organizationId,
						locals.user?.id || '',
						newOwnerId
					);
				}
			}

			// Leave the organization
			await auth.api.removeMember({
				headers: request.headers,
				body: {
					organizationId,
					memberIdOrEmail: activeMember.id || ''
				}
			});
		} catch (error) {
			console.error('Error leaving organization:', error);
			return fail(500, { error: 'Failed to leave organization' });
		}

		// Redirect to main organization page after leaving successfully
		throw redirect(303, '/settings/organization');
	},

	acceptInvitation: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Missing invitation ID' });
		}

		try {
			await auth.api.acceptInvitation({
				headers: request.headers,
				body: { invitationId }
			});

			return { success: true, acceptedInvitation: true };
		} catch (error) {
			console.error('Error accepting invitation:', error);
			return fail(500, { error: 'Failed to accept invitation' });
		}
	},

	rejectInvitation: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Missing invitation ID' });
		}

		try {
			await auth.api.rejectInvitation({
				headers: request.headers,
				body: { invitationId }
			});

			return { success: true, rejectedInvitation: true };
		} catch (error) {
			console.error('Error rejecting invitation:', error);
			return fail(500, { error: 'Failed to reject invitation' });
		}
	}
};
