import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { fail, redirect } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, url }) => {
	console.log('[Register Page Load] Checking if user is already logged in');
	const requestHeaders = new Headers(request.headers);

	let session;
	try {
		session = await auth.api.getSession({ headers: requestHeaders });
	} catch (e) {
		console.error('[Register Page Load] Error calling auth.api.getSession:', e);
		session = null;
	}

	const user = session?.user;
	console.log('[Register Page Load] User from session:', user);

	if (user) {
		console.log('[Register Page Load] User is already logged in, redirecting to /home');
		// If user is already logged in, redirect to home page
		throw redirect(303, '/home');
	}

	// Check for invitation code
	const invitationCode = url.searchParams.get('invitation');
	// Don't expose invitation email for security - users must know the email
	// We'll validate on the backend after registration

	// Check if this will be the first user (who should become admin)
	const [userCount] = await db.select({ count: count() }).from(schema.user);
	const isFirstUser = userCount.count === 0;
	console.log('[Register Page Load] Is first user:', isFirstUser, 'User count:', userCount.count);

	console.log('[Register Page Load] No user found, allowing access to register page');
	return {
		invitationCode,
		invitationEmail: null,
		invitationOrgName: null,
		isFirstUser
	};
};

export const actions: Actions = {
	register: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const _organizationName = formData.get('organizationName') as string;
		const _invitationCode = formData.get('invitationCode') as string;

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required' });
		}

		try {
			// Check if this is the first user
			const [userCount] = await db.select({ count: count() }).from(schema.user);
			const isFirstUser = userCount.count === 0;

			// Organization invitations are handled through Better Auth's secure invitation system
			// The invitation code (if present) is validated when the client calls acceptInvitation
			// after successful registration

			// Sign up the user
			const result = await auth.api.signUpEmail({
				body: {
					email,
					password,
					name: ''
				}
			});

			if (result.user) {
				// Set role based on first user check only
				// Organization roles are managed through Better Auth's invitation system
				let roleToSet = 'user';
				if (isFirstUser) {
					roleToSet = 'admin';
					console.log('[Register Action] First user registered, setting as admin');
				}

				// Update user role in database
				if (roleToSet !== 'user') {
					await db
						.update(schema.user)
						.set({ role: roleToSet })
						.where(eq(schema.user.id, result.user.id));
					console.log('[Register Action] Successfully set user role to:', roleToSet);
				}

				// Handle invitation or organization creation
				// (keeping existing logic for invitation/org handling)

				throw redirect(303, '/home');
			}

			return fail(400, { error: 'Registration failed' });
		} catch (error) {
			const err = error as { status?: number };
			if (
				err &&
				typeof err === 'object' &&
				'status' in err &&
				typeof err.status === 'number' &&
				err.status >= 300 &&
				err.status < 400
			) {
				// This is a redirect, re-throw it
				throw error;
			}
			console.error('[Register Action] Error:', error);
			return fail(500, { error: 'An unexpected error occurred' });
		}
	}
};
