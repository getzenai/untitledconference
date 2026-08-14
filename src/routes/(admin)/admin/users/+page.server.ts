import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { createLogger } from '$lib/server/logger';
import { takeInvitationLink } from '$lib/server/services/invitation-link';
import { invalidatePasswordResetTokensForEmail } from '$lib/server/services/invitation-token';
import {
	createSystemInvitation,
	listAllInvitations,
	validateSystemInvitation
} from '$lib/server/services/system-invitation';
import { fail } from '@sveltejs/kit';
import { generateRandomString } from 'better-auth/crypto';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const logger = createLogger('AdminUsers');

/**
 * Generate an invitation link and take it back.
 *
 * `requestPasswordReset` awaits `sendResetPassword`, which hands the URL to
 * `captureInvitationLink` — so by the time this resolves the link is waiting
 * in memory. Null means the callback did not run (a fork that configured
 * `advanced.backgroundTasks`), and the caller says so rather than showing a
 * link it does not have.
 */
async function triggerInvitationLink(email: string, headers: Headers) {
	await auth.api.requestPasswordReset({
		body: {
			email,
			redirectTo: '/complete-registration'
		},
		headers
	});

	return takeInvitationLink(email);
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
			return fail(401, { action: 'createInvitation', error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const email = formData.get('email') as string;
		const role = formData.get('role') as string;

		if (!email) {
			return fail(400, { action: 'createInvitation', error: 'Email is required' });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return fail(400, { action: 'createInvitation', error: 'Invalid email address' });
		}

		if (role && !['user', 'admin'].includes(role)) {
			return fail(400, { action: 'createInvitation', error: 'Invalid role' });
		}

		try {
			// 1. Create invitation record
			await createSystemInvitation({
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
			const invitationLink = await triggerInvitationLink(email, request.headers);

			if (!invitationLink) {
				// Link generation is still in progress, but the invitation was created successfully
				logger.warn('Invitation created but link generation timed out', { email });
				return {
					action: 'createInvitation',
					success: true,
					invitationLink: null,
					message: 'Invitation created. The link will be available shortly.'
				};
			}

			return {
				action: 'createInvitation',
				success: true,
				invitationLink
			};
		} catch (error) {
			logger.error('Error creating invitation', error as Error);

			if (error instanceof Error) {
				if (error.message.includes('already exists')) {
					return fail(400, {
						action: 'createInvitation',
						error: error.message
					});
				}
			}

			return fail(500, {
				action: 'createInvitation',
				error: 'Failed to create invitation'
			});
		}
	},

	createUser: async ({ locals, request }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(401, { action: 'createUser', error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const rawEmail = formData.get('email');
		const rawPassword = formData.get('password');
		const rawRole = formData.get('role');

		const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
		const password = typeof rawPassword === 'string' ? rawPassword : '';
		const role = (
			typeof rawRole === 'string' && ['user', 'admin'].includes(rawRole) ? rawRole : 'user'
		) as 'user' | 'admin';

		if (!email || !password) {
			return fail(400, {
				action: 'createUser',
				error: 'Email and password are required'
			});
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return fail(400, { action: 'createUser', error: 'Invalid email address' });
		}

		if (password.length < 12) {
			return fail(400, {
				action: 'createUser',
				error: 'Password must be at least 12 characters long'
			});
		}

		try {
			const { user: createdUser } = await auth.api.createUser({
				body: {
					email,
					password,
					role,
					name: ''
				},
				headers: request.headers
			});

			if (!createdUser) {
				return fail(500, {
					action: 'createUser',
					error: 'Failed to create user'
				});
			}

			const [fullUser] = await db
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
				.where(eq(schema.user.id, createdUser.id))
				.limit(1);

			if (!fullUser) {
				return fail(500, {
					action: 'createUser',
					error: 'Failed to load created user'
				});
			}

			return {
				action: 'createUser',
				success: true,
				createdUser: fullUser
			};
		} catch (error) {
			logger.error('Error creating user', error as Error);

			if (error instanceof Error) {
				if (error.message.includes('USER_ALREADY_EXISTS')) {
					return fail(400, {
						action: 'createUser',
						error: 'A user with this email already exists'
					});
				}
				if (error.message.includes('PASSWORD_TOO_SHORT')) {
					return fail(400, {
						action: 'createUser',
						error: 'Password is too short'
					});
				}
				if (error.message.includes('PASSWORD_TOO_LONG')) {
					return fail(400, {
						action: 'createUser',
						error: 'Password is too long'
					});
				}
			}

			return fail(500, {
				action: 'createUser',
				error: 'Failed to create user'
			});
		}
	},

	regenerateInvitation: async ({ locals, request }) => {
		// Check if user is admin
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(401, { action: 'regenerateInvitation', error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, {
				action: 'regenerateInvitation',
				error: 'Invalid invitation data'
			});
		}

		// The address comes from the invitation, never from the form (#407). The
		// form used to carry both, and nothing checked that they belonged
		// together. While this action only sent a mail that was a mail to an
		// address of the caller's choosing; since #401 it also deletes that
		// address's live reset tokens, so a wrong `email` destroys a stranger's
		// password reset. `validateSystemInvitation` also refuses an invitation
		// that has already been accepted, which is the other thing this button
		// must not touch.
		const invitation = await validateSystemInvitation(invitationId);

		if (!invitation) {
			return fail(400, {
				action: 'regenerateInvitation',
				error: 'Invalid invitation data'
			});
		}

		const email = invitation.email;

		try {
			// Replace a leaked link, not a lost one (#401). Drop the previous
			// reset tokens before Better Auth writes the new row, otherwise
			// both links complete registration until the old one expires.
			await invalidatePasswordResetTokensForEmail(email);

			const invitationLink = await triggerInvitationLink(email, request.headers);

			if (!invitationLink) {
				// Link generation is still in progress
				logger.warn('Invitation regeneration timed out', { email });
				return {
					action: 'regenerateInvitation',
					success: true,
					invitationLink: null,
					message: 'Invitation regenerated. The previous link no longer works.'
				};
			}

			return {
				action: 'regenerateInvitation',
				success: true,
				invitationLink
			};
		} catch (error) {
			logger.error('Error regenerating invitation', error as Error);
			return fail(500, {
				action: 'regenerateInvitation',
				error: 'Failed to regenerate invitation'
			});
		}
	},

	setEmailVerification: async ({ locals, request }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId');
		const emailVerifiedValue = formData.get('emailVerified');

		if (typeof userId !== 'string' || typeof emailVerifiedValue !== 'string') {
			return fail(400, { error: 'Invalid request data' });
		}

		if (emailVerifiedValue !== 'true' && emailVerifiedValue !== 'false') {
			return fail(400, { error: 'Invalid verification status' });
		}

		const emailVerified = emailVerifiedValue === 'true';

		try {
			const [updatedUser] = await db
				.update(schema.user)
				.set({
					emailVerified,
					updatedAt: new Date()
				})
				.where(eq(schema.user.id, userId))
				.returning({ id: schema.user.id });

			if (!updatedUser) {
				return fail(404, { error: 'User not found' });
			}

			return { success: true };
		} catch (error) {
			logger.error('Error updating email verification status', error as Error);
			return fail(500, { error: 'Failed to update email verification status' });
		}
	}
};
