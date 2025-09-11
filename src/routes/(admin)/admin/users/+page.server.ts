import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import {
	createSystemInvitation,
	listAllInvitations,
	pollForInvitationLink
} from '$lib/server/services/system-invitation';
import { fail } from '@sveltejs/kit';
import { generateRandomString } from 'better-auth/crypto';
import { desc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

// Helper function to trigger password reset and poll for link
async function triggerInvitationLink(email: string, invitationId: string, headers: Headers) {
	// Trigger password reset with invitation-specific callback
	await auth.api.forgetPassword({
		body: {
			email,
			redirectTo: '/complete-registration'
		},
		headers
	});

	// Poll for the link (max 6 seconds)
	const invitationLink = await pollForInvitationLink(
		invitationId,
		30, // max attempts
		200 // 200ms between attempts
	);

	return invitationLink;
}

export const load: PageServerLoad = async ({ locals }) => {
	// Get current user from locals (already validated by layout)
	const currentUser = locals.user;

	// Fetch ALL users - client-side search will handle filtering
	const users = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			role: schema.user.role,
			banned: schema.user.banned,
			banReason: schema.user.banReason,
			createdAt: schema.user.createdAt,
			emailVerified: schema.user.emailVerified
		})
		.from(schema.user)
		.orderBy(desc(schema.user.createdAt));

	// Calculate stats
	const stats = {
		totalUsers: users.length,
		bannedUsers: users.filter((u) => u.banned).length,
		adminUsers: users.filter((u) => u.role === 'admin').length
	};

	// Load invitations with inviter details
	const rawInvitations = await listAllInvitations();

	// Sort by createdAt in descending order (newest first)
	const invitations = rawInvitations
		.map((inv) => ({
			...inv,
			// Status is already computed in getSystemInvitations but we need it for listAllInvitations
			status: inv.acceptedAt ? 'accepted' : new Date() > inv.expiresAt ? 'expired' : 'pending'
		}))
		.sort((a, b) => {
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});

	return {
		currentUser,
		users,
		stats,
		invitations
	};
};

export const actions: Actions = {
	createInvitation: async ({ locals, request }) => {
		// Check if user is admin
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const email = formData.get('email') as string;
		const role = formData.get('role') as string;

		if (!email) {
			return fail(400, { error: 'Email is required' });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return fail(400, { error: 'Invalid email address' });
		}

		if (role && !['user', 'admin'].includes(role)) {
			return fail(400, { error: 'Invalid role' });
		}

		try {
			// 1. Create invitation record
			const invitation = await createSystemInvitation({
				email,
				invitedBy: locals.user.id,
				role: role || 'user'
			});

			// 2. Create user with random password
			const tempPassword = generateRandomString(32);
			await auth.api.createUser({
				body: {
					email,
					password: tempPassword,
					role: (role || 'user') as 'user' | 'admin',
					name: ''
				},
				headers: request.headers
			});

			// 3. Trigger password reset and poll for link
			const invitationLink = await triggerInvitationLink(email, invitation.id, request.headers);

			if (!invitationLink) {
				// Link generation is still in progress, but the invitation was created successfully
				console.log('[Admin] Invitation created but link generation timed out for:', email);
				return {
					success: true,
					invitationLink: null,
					message: 'Invitation created. The link will be available shortly.'
				};
			}

			return {
				success: true,
				invitationLink
			};
		} catch (error) {
			console.error('Error creating invitation:', error);

			if (error instanceof Error) {
				if (error.message.includes('already exists')) {
					return fail(400, { error: error.message });
				}
			}

			return fail(500, { error: 'Failed to create invitation' });
		}
	},

	regenerateInvitation: async ({ locals, request }) => {
		// Check if user is admin
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;
		const email = formData.get('email') as string;

		if (!invitationId || !email) {
			return fail(400, { error: 'Invalid invitation data' });
		}

		try {
			// Trigger password reset and poll for link
			const invitationLink = await triggerInvitationLink(email, invitationId, request.headers);

			if (!invitationLink) {
				// Link generation is still in progress
				console.log('[Admin] Invitation regeneration timed out for:', email);
				return {
					success: true,
					invitationLink: null,
					message: 'Invitation regenerated. The link will be available shortly.'
				};
			}

			return {
				success: true,
				invitationLink
			};
		} catch (error) {
			console.error('Error regenerating invitation:', error);
			return fail(500, { error: 'Failed to regenerate invitation' });
		}
	}
};
