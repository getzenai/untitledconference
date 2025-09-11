import { auth } from '$lib/auth';
import { transferOwnershipSafely } from '$lib/server/utils/auth-helpers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	try {
		// Get request headers for API calls
		const headers = request.headers;

		// Get active member info to get current role and organization
		const activeMember = await auth.api.getActiveMember({
			headers
		});

		// Get user's pending invitations (invitations sent to them)
		let userInvitations: Array<Record<string, unknown>> = [];
		try {
			const invites = await auth.api.listUserInvitations({
				headers,
				query: {
					email: locals.user.email
				}
			});

			// Process invitations to get full details
			if (invites && invites.length > 0) {
				// Fetch full details for each invitation
				const invitationPromises = invites.map(async (invite) => {
					try {
						// Get full invitation details including organization name
						const fullInvite = await auth.api.getInvitation({
							headers,
							query: {
								id: invite.id
							}
						});

						return {
							...invite,
							...fullInvite,
							// Ensure we have the organization name
							organizationName:
								fullInvite?.organizationName ||
								(invite as Record<string, unknown>).organizationName ||
								'Unknown Organization',
							// Better Auth might provide inviterEmail directly
							inviterEmail:
								fullInvite?.inviterEmail ||
								(invite as Record<string, unknown>).inviterEmail ||
								'System'
						};
					} catch (err) {
						console.log(`Could not fetch details for invitation ${invite.id}:`, err);
						return {
							...invite,
							organizationName: 'Unknown Organization',
							inviterEmail: 'Unknown'
						};
					}
				});

				userInvitations = await Promise.all(invitationPromises);

				// Filter to only show pending invitations
				userInvitations = userInvitations.filter((inv) => inv.status === 'pending');
			}
		} catch (error) {
			console.log('Could not fetch user invitations:', error);
		}

		if (!activeMember) {
			return {
				organization: null,
				currentMember: null,
				members: [],
				invitations: [],
				userInvitations: userInvitations || []
			};
		}

		// Get list of all organizations the user is a member of
		const organizations = await auth.api.listOrganizations({
			headers
		});

		// Find the active organization from the list
		const organization = organizations?.find((org) => org.id === activeMember.organizationId);

		if (!organization) {
			return {
				organization: null,
				currentMember: null,
				members: [],
				invitations: [],
				userInvitations: userInvitations || []
			};
		}

		// Get organization members
		const membersResponse = await auth.api.listMembers({
			headers,
			query: {
				organizationId: organization.id
			}
		});

		const members = membersResponse?.members || [];

		// The current member info comes from activeMember
		const currentMember = {
			id: activeMember.id,
			userId: activeMember.userId,
			organizationId: activeMember.organizationId,
			role: activeMember.role,
			user: locals.user
		};

		// Get invitations (only for admins/owners)
		let invitations: Array<Record<string, unknown>> = [];
		if (activeMember.role === 'admin' || activeMember.role === 'owner') {
			const allInvitations =
				(await auth.api.listInvitations({
					headers,
					query: {
						organizationId: organization.id
					}
				})) || [];

			// Filter out accepted invitations - only show pending ones
			invitations = allInvitations.filter((inv) => inv.status === 'pending');
		}

		return {
			organization,
			currentMember,
			members,
			invitations,
			userInvitations: userInvitations || []
		};
	} catch (error) {
		console.error('Error loading organization data:', error);
		return {
			organization: null,
			currentMember: null,
			members: [],
			invitations: [],
			userInvitations: []
		};
	}
};

export const actions: Actions = {
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
				body: {
					organizationId,
					memberIdOrEmail: memberId
				}
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
				body: {
					invitationId
				}
			});

			return { success: true };
		} catch (error) {
			console.error('Error cancelling invitation:', error);
			return fail(500, { error: 'Failed to cancel invitation' });
		}
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
				body: {
					invitationId
				}
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
				body: {
					invitationId
				}
			});

			return { success: true, rejectedInvitation: true };
		} catch (error) {
			console.error('Error rejecting invitation:', error);
			return fail(500, { error: 'Failed to reject invitation' });
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
			// Get current member info
			const activeMember = await auth.api.getActiveMember({
				headers: request.headers
			});

			if (!activeMember || activeMember.organizationId !== organizationId) {
				return fail(400, { error: 'You are not a member of this organization' });
			}

			// Get all members to check if user is the only member
			const membersResponse = await auth.api.listMembers({
				headers: request.headers,
				query: {
					organizationId
				}
			});

			const members = membersResponse?.members || [];
			const otherMembers = members.filter((m) => m.userId !== locals.user.id);

			// Check if user is owner and there are other members
			if (activeMember.role === 'owner' && otherMembers.length > 0) {
				if (!newOwnerId) {
					// Need to transfer ownership first
					return fail(400, {
						error: 'You must transfer ownership before leaving the organization',
						needsOwnerTransfer: true
					});
				}

				// Transfer ownership to the selected member
				const newOwner = members.find((m) => m.id === newOwnerId);
				if (!newOwner) {
					return fail(400, { error: 'Invalid new owner selected' });
				}

				// Use safe ownership transfer to prevent race conditions
				const transferResult = await transferOwnershipSafely(
					auth,
					request.headers,
					organizationId,
					locals.user.id,
					newOwnerId
				);

				if (!transferResult.success) {
					return fail(500, { error: transferResult.error || 'Failed to transfer ownership' });
				}
			} else if (activeMember.role === 'owner' && otherMembers.length === 0) {
				// User is the only member and owner, delete the organization
				await auth.api.deleteOrganization({
					headers: request.headers,
					body: {
						organizationId
					}
				});
			} else {
				// Regular member, just leave
				await auth.api.leaveOrganization({
					headers: request.headers,
					body: {
						organizationId
					}
				});
			}

			// After leaving/deleting, check if user has other organizations
			const orgs = await auth.api.listOrganizations({
				headers: request.headers
			});

			if (orgs && orgs.length > 0) {
				// Set the first available organization as active
				await auth.api.setActiveOrganization({
					headers: request.headers,
					body: {
						organizationId: orgs[0].id
					}
				});
			}

			return { success: true, leftOrganization: true };
		} catch (error) {
			console.error('Error leaving organization:', error);
			return fail(500, { error: 'Failed to leave organization' });
		}
	}
};
