import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { redirect } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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

	// Check for system invitation token
	const systemToken = url.searchParams.get('token');
	const invitationEmail = url.searchParams.get('email');
	const invitationRole = url.searchParams.get('role');

	// Check for organization invitation code (existing functionality)
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
		systemToken,
		invitationEmail: systemToken ? invitationEmail : null,
		invitationRole: systemToken ? invitationRole : null,
		invitationOrgName: null,
		isFirstUser
	};
};
