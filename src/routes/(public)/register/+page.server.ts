import { auth } from '$lib/auth';
import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const load: ServerLoad = async ({ request }) => {
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

	console.log('[Register Page Load] No user found, allowing access to register page');
	return {};
};
