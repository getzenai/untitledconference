import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, request }) => {
	console.log('[Protected Layout Load] Request URL:', request.url);
	const requestHeaders = new Headers(request.headers);
	console.log('[Protected Layout Load] Cookies:', requestHeaders.get('cookie'));

	let session;
	try {
		session = await auth.api.getSession({ headers: requestHeaders });
	} catch (e) {
		console.error('[Protected Layout Load] Error calling auth.api.getSession:', e);
		session = null;
	}

	console.log('[Protected Layout Load] Session from auth.api.getSession:', session);
	const user = session?.user; // Assuming session object has a user property
	console.log('[Protected Layout Load] User derived from session:', user);

	if (!user) {
		console.log('[Protected Layout Load] No user from session, redirecting to login.');
		// If user is not logged in, redirect to login page with return URL
		throw redirect(303, `/login?returnTo=${url.pathname}`);
	}

	console.log('[Protected Layout Load] User found, allowing access. User data:', user);
	return {
		user: user
	};
};
