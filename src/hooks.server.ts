import { auth } from '$lib/auth';
import { i18n } from '$lib/i18n';
import { error, type Handle } from '@sveltejs/kit'; // Removed ResolveOptions
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

// This new handler will attempt to populate event.locals.user on every request.
const populateLocalsUserHandler: Handle = async ({ event, resolve }) => {
	try {
		const requestHeaders = new Headers(event.request.headers);
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (session?.user) {
			event.locals.user = session.user;
			console.log('[PopulateLocalsUserHandler] Set event.locals.user:', event.locals.user?.email);
		} else {
			console.log('[PopulateLocalsUserHandler] No session or user found.');
		}
	} catch (e) {
		console.error('[PopulateLocalsUserHandler] Error calling auth.api.getSession:', e);
		// Do not throw an error here, just proceed without setting locals.user
		// Other parts of the system (like protected layouts) will handle unauthorized access.
	}
	return resolve(event);
};

const API_V1_PUBLIC_PREFIX = '/api/v1/public';
const API_V1_TEST_PREFIX = '/api/v1/test';
const API_V1_PREFIX = '/api/v1';

// This handler protects non-public API v1 routes.
// It uses auth.api.getSession() to check for an authenticated user
// and populates event.locals.user if successful.
const apiProtectionHandler: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (pathname.startsWith(API_V1_PREFIX)) {
		if (pathname.startsWith(API_V1_PUBLIC_PREFIX)) {
			return resolve(event);
		} else if (pathname.startsWith(API_V1_TEST_PREFIX)) {
			const isTestEnv =
				process.env.NODE_ENV === 'test' ||
				process.env.PLAYWRIGHT_TEST === 'true' ||
				process.env.npm_lifecycle_event?.includes('test');

			if (!isTestEnv) {
				return error(403, 'Test endpoints only available in test environment');
			} else {
				return resolve(event);
			}
		} else {
			let session;
			try {
				const requestHeaders = new Headers(event.request.headers);
				session = await auth.api.getSession({ headers: requestHeaders });
			} catch (e) {
				console.error('[API Protection] Error calling auth.api.getSession:', e);
				session = null;
			}

			const user = session?.user;
			if (!user) {
				return new Response(JSON.stringify({ message: 'Unauthorized. Please login.' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			// If user is authenticated, add user to locals for the API route itself.
			event.locals.user = user;

			return resolve(event);
		}
	}
	return resolve(event);
};

const paraglideHandler: Handle = i18n.handle();

// Sequence of handlers: Better Auth, API Protection, Paraglide
export const handle: Handle = sequence(
	populateLocalsUserHandler, // Run this first to ensure locals.user is set
	(params) => svelteKitHandler({ ...params, auth }),
	apiProtectionHandler,
	paraglideHandler
);
