import { auth } from '$lib/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { detectAiCrawler } from '$lib/server/bot-detection';
import { createLogger } from '$lib/server/logger';
import { captureException } from '$lib/server/posthog';
import { applySecurityHeaders } from '$lib/server/security-headers';
import '$lib/server/startup';
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const logger = createLogger('Hooks');

const API_V1_PUBLIC_PREFIX = '/api/v1/public';
const API_V1_TEST_PREFIX = '/api/v1/test';
const API_V1_PREFIX = '/api/v1';

// Outermost handler: security headers apply per-response, so they must also
// cover the short-circuit responses produced further down (401/403) and every
// non-HTML API response.
const securityHeadersHandler: Handle = async ({ event, resolve }) =>
	applySecurityHeaders(await resolve(event));

// Bot detection is applied to the public auth/API surface only. Known AI
// crawlers legitimately GET public pages (that is what indexing is), but they
// have no business submitting logins, registrations or invitations, so
// state-changing requests carrying a crawler User-Agent are rejected. This
// keeps crawler traffic out of the auth rate limits and the signup funnel.
// The User-Agent is self-declared and therefore spoofable: treat this as noise
// reduction, not as an access control — nothing else relies on it.
const BOT_GUARDED_PREFIXES = ['/api/auth', API_V1_PUBLIC_PREFIX];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const botDetectionHandler: Handle = async ({ event, resolve }) => {
	const isGuarded = BOT_GUARDED_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix));

	if (isGuarded && !SAFE_METHODS.has(event.request.method)) {
		const crawler = detectAiCrawler(event.request.headers.get('user-agent'));
		if (crawler) {
			logger.warn('Rejected AI crawler on public endpoint', {
				crawler: crawler.name,
				operator: crawler.operator,
				category: crawler.category,
				method: event.request.method,
				path: event.url.pathname
			});
			return new Response(JSON.stringify({ message: 'Automated clients are not allowed here.' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
};

// This new handler will attempt to populate event.locals.user and organization on every request.
const populateLocalsUserHandler: Handle = async ({ event, resolve }) => {
	logger.debug('Processing request for:', event.url.pathname);
	try {
		const requestHeaders = new Headers(event.request.headers);
		const session = await auth.api.getSession({ headers: requestHeaders });
		logger.debug('Session check:', {
			hasSession: !!session,
			hasUser: !!session?.user,
			userId: session?.user?.id,
			email: session?.user?.email,
			path: event.url.pathname
		});
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
		logger.debug('Failed to get session, proceeding without auth');
	}
	return resolve(event);
};

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

const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => {
				return html.replace('%lang%', locale);
			}
		});
	});

/**
 * Reports unexpected server errors to PostHog error tracking.
 *
 * Only 5xx-class failures are treated as errors: 4xx statuses are routine
 * (404s, rejected input) and would drown out real incidents. A no-op when
 * PostHog is not configured.
 */
export const handleError: HandleServerError = ({ error, status, message, event }) => {
	if (status >= 500) {
		logger.error('Unhandled server error', error, { pathname: event.url.pathname, status });
		captureException(
			error instanceof Error ? error : new Error(String(error)),
			event.locals.user?.id,
			{
				pathname: event.url.pathname,
				status
			}
		);
	} else {
		logger.debug('Client error', { pathname: event.url.pathname, status });
	}

	return { message };
};

// Sequence of handlers: Security headers, Bot detection, Better Auth,
// API Protection, Paraglide
export const handle: Handle = sequence(
	securityHeadersHandler, // Outermost, so every response below carries the headers
	botDetectionHandler, // Reject crawlers before any auth/session work
	populateLocalsUserHandler, // Run this first to ensure locals.user is set
	({ event, resolve }) => svelteKitHandler({ auth, event, resolve, building: false }),
	apiProtectionHandler,
	paraglideHandle
);
