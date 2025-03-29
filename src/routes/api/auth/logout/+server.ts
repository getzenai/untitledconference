import { redirect } from '@sveltejs/kit';
import { deleteSessionTokenCookie, sessionCookieName, invalidateSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { cookies, locals } = event;

	// Get the session ID if available
	const sessionToken = cookies.get(sessionCookieName);

	if (sessionToken && locals.session) {
		// Invalidate the session in the database
		await invalidateSession(locals.session.id);
	}

	// Clear the session cookie
	deleteSessionTokenCookie(event);

	// Redirect to the login page
	return redirect(303, '/login');
};
