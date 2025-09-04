import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
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

	// Check for invitation code
	const invitationCode = url.searchParams.get('invitation');
	// Don't expose invitation email for security - users must know the email
	// We'll validate on the backend after registration

	console.log('[Register Page Load] No user found, allowing access to register page');
	return {
		invitationCode,
		invitationEmail: null,
		invitationOrgName: null
	};
};
