import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { fail } from '@sveltejs/kit';
import { like } from 'drizzle-orm';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const token = formData.get('token') as string;
		const newPassword = formData.get('password') as string;

		if (!token || !newPassword) {
			return fail(400, { error: 'Missing required fields' });
		}

		if (newPassword.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters' });
		}

		try {
			// Find the invitation by token in the resetLink path
			// The URL format is: /api/auth/reset-password/{token}?callbackURL=...
			const invitations = await db
				.select()
				.from(schema.systemInvitation)
				.where(like(schema.systemInvitation.resetLink, `%/reset-password/${token}?%`))
				.limit(1);

			if (invitations.length === 0) {
				console.error('No invitation found for token');
				return fail(400, {
					error: 'This invitation link has expired or is invalid. Please request a new invitation.'
				});
			}

			const invitation = invitations[0];
			const email = invitation.email;

			// Reset the password
			const resetResponse = await auth.api.resetPassword({
				body: {
					newPassword,
					token
				},
				headers: request.headers,
				asResponse: true
			});

			if (!resetResponse || !resetResponse.ok) {
				console.error('Password reset failed');
				return fail(400, {
					error: 'This invitation link has expired or is invalid. Please request a new invitation.'
				});
			}

			// Password reset successful - return email for client-side login
			return {
				success: true,
				email,
				password: newPassword // Pass the password for auto-login
			};
		} catch (error) {
			console.error('Error completing registration:', error);
			return fail(500, { error: 'Failed to complete registration. Please try again.' });
		}
	}
};
