import { i18n } from '$lib/i18n';
import * as auth from '$lib/server/auth.js';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Define path prefixes for API v1
const API_V1_PUBLIC_PREFIX = '/api/v1/public';
const API_V1_PREFIX = '/api/v1';

// First, the Lucia auth handler to populate locals
const luciaAuthHandler: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.sessionCookieName);
	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = await auth.validateSessionToken(sessionToken);
		if (session) {
			// Refresh cookie if session is valid
			auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
		} else {
			// Delete cookie if session is invalid
			auth.deleteSessionTokenCookie(event);
		}
		event.locals.user = user;
		event.locals.session = session;
	}
	return resolve(event); // Pass to the next handler in sequence
};

// Second, the API protection handler
const apiProtectionHandler: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (pathname.startsWith(API_V1_PREFIX)) {
		// This is an /api/v1 route
		if (pathname.startsWith(API_V1_PUBLIC_PREFIX)) {
			// Public /api/v1/public routes: no additional auth check needed here, proceed
			return resolve(event);
		} else {
			if (!event.locals.user) {
				// User is not authenticated, deny access
				return new Response(JSON.stringify({ message: 'Unauthorized. Please login.' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			// If user is authenticated for a protected API route, allow access.
			return resolve(event);
			// return resolve(event);
		}
	}
	// For any other path (non /api/v1 routes), proceed
	return resolve(event);
};

// Paraglide handler
const paraglideHandler: Handle = i18n.handle();

// Sequence the handlers: Lucia Auth -> API Protection -> Paraglide
export const handle: Handle = sequence(luciaAuthHandler, apiProtectionHandler, paraglideHandler);
