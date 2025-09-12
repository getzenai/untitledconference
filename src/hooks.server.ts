import { auth } from '$lib/auth';
import { i18n } from '$lib/i18n';
import { type Handle } from '@sveltejs/kit'; // Removed ResolveOptions
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

// This new handler will attempt to populate event.locals.user and organization on every request.
const populateLocalsUserHandler: Handle = async ({ event, resolve }) => {
	try {
		const requestHeaders = new Headers(event.request.headers);
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (session?.user) {
			event.locals.user = session.user;

			// Check if user is a system admin
			event.locals.isAdmin = session.user.role === 'admin';

			// Check if we're impersonating (Better Auth adds impersonatedBy to the session)
			const impersonatedBy =
				session.session?.impersonatedBy || (session as { impersonatedBy?: string }).impersonatedBy;

			if (impersonatedBy) {
				event.locals.impersonating = {
					originalUserId: impersonatedBy,
					originalUserEmail: '' // Could be fetched if needed for display
				};
			} else {
				event.locals.impersonating = null;
			}

			// Get active organization from session
			if (session.session?.activeOrganizationId) {
				event.locals.organizationId = session.session.activeOrganizationId;

				// Get user's role in the active organization
				try {
					const orgMembers = await auth.api.listMembers({
						headers: requestHeaders,
						query: {
							organizationId: session.session.activeOrganizationId
						}
					});

					const currentMember = orgMembers?.members?.find((m) => m.userId === session.user.id);

					if (currentMember) {
						event.locals.organizationRole = currentMember.role;
					} else {
						event.locals.organizationRole = null;
					}
				} catch (_e) {
					event.locals.organizationRole = null;
				}
			} else {
				// No active organization set
				event.locals.organizationId = null;
				event.locals.organizationRole = null;
			}
		}
	} catch (_e) {
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

const isTestEnvironment = (): boolean => {
	// SECURITY: Only allow test endpoints when explicitly enabled
	// This prevents accidental exposure of test endpoints in production
	return process.env.ENABLE_TEST_ENDPOINTS === 'true';
};

const apiProtectionHandler: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (pathname.startsWith(API_V1_PREFIX)) {
		if (pathname.startsWith(API_V1_PUBLIC_PREFIX)) {
			return resolve(event);
		} else if (pathname.startsWith(API_V1_TEST_PREFIX)) {
			if (!isTestEnvironment()) {
				return new Response(
					JSON.stringify({ message: 'Test endpoints only available in test environment' }),
					{
						status: 403,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			} else {
				return resolve(event);
			}
		} else {
			let session;
			try {
				const requestHeaders = new Headers(event.request.headers);
				session = await auth.api.getSession({ headers: requestHeaders });
			} catch (_e) {
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
	({ event, resolve }) => svelteKitHandler({ auth, event, resolve, building: false }),
	apiProtectionHandler,
	paraglideHandler
);
