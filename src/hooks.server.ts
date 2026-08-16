import { auth, firstOrganizationFor } from '$lib/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { detectAiCrawler } from '$lib/server/bot-detection';
import { db, needsRequestScopedDb, withRequestScopedDb } from '$lib/server/db';
import { member } from '$lib/server/db/auth-schema';
import { htmlCacheHandler } from '$lib/server/html-cache';
import { createLogger } from '$lib/server/logger';
import { captureException } from '$lib/server/posthog';
import { publicPageCacheHandler } from '$lib/server/public-page-cache';
import { applySecurityHeaders } from '$lib/server/security-headers';
import '$lib/server/startup';
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { and, eq } from 'drizzle-orm';

const logger = createLogger('Hooks');

const API_V1_PUBLIC_PREFIX = '/api/v1/public';
const API_V1_TEST_PREFIX = '/api/v1/test';
// The MCP endpoint authenticates with OAuth bearer tokens, not session cookies,
// and does the verification itself. It must bypass the cookie guard below:
// that guard's bare 401 carries no WWW-Authenticate header, which is precisely
// the header an MCP client needs in order to discover the authorization server
// and start the OAuth flow. Guarding it here would make the endpoint
// undiscoverable rather than more secure.
const API_V1_MCP_PREFIX = '/api/v1/mcp';
const API_V1_PREFIX = '/api/v1';
// Resource routes, the OpenAPI spec and the docs page authenticate themselves
// (bearer for the tools, none for the spec). The cookie guard's bare 401 would
// strip the WWW-Authenticate header the OAuth client needs.
const API_V1_BEARER_PREFIXES = [
	API_V1_MCP_PREFIX,
	'/api/v1/conferences',
	'/api/v1/cfps',
	'/api/v1/me',
	'/api/v1/openapi.json',
	'/api/v1/docs'
];
const isBearerApi = (pathname: string) =>
	API_V1_BEARER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

// Outermost handler: security headers apply per-response, so they must also
// cover the short-circuit responses produced further down (401/403) and every
// non-HTML API response.
const securityHeadersHandler: Handle = async ({ event, resolve }) =>
	applySecurityHeaders(await resolve(event), event.url.pathname);

// SvelteKit's own `csrf.checkOrigin` is off in svelte.config.js, and this is the
// check that replaces it — same rule, one exception.
//
// The exception is the OAuth token endpoint. RFC 6749 requires the token request
// to be `application/x-www-form-urlencoded`, and it is made by the client
// *server-to-server*, so it carries no `Origin` header at all. SvelteKit's rule
// treats a missing origin as cross-site and answers 403 with an HTML body, which
// reaches an MCP client as an unparseable OAuth error. That is exactly what
// `claude mcp` reported: registration (JSON) succeeded, authorization succeeded,
// and the token exchange died at the last step. `csrf.trustedOrigins` cannot fix
// it — there is no origin to trust.
//
// Four sibling endpoints join it, and the list is exact paths rather than the
// `/api/auth/oauth2/` prefix on purpose: token, register, revoke and introspect
// are the machine half of the protocol — the caller proves itself with the client
// credentials or the token it carries, and no browser cookie is at stake. The
// rest of that prefix is not like that. `create-client`, `delete-client` and
// `update-consent` are management endpoints authenticated by the signed-in user's
// session cookie, which is exactly what the origin check protects; a prefix
// exemption would hand them to any cross-site form.
//
// Everything else — every form action in the app — keeps the original rule.
const CSRF_EXEMPT_PATHS = [
	'/api/auth/oauth2/token',
	'/api/auth/oauth2/register',
	'/api/auth/oauth2/revoke',
	'/api/auth/oauth2/introspect'
];
const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];
const CSRF_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const isFormContentType = (request: Request): boolean => {
	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	return FORM_CONTENT_TYPES.includes(type);
};

const csrfHandler: Handle = ({ event, resolve }) => {
	const { request, url } = event;
	const exempt = CSRF_EXEMPT_PATHS.includes(url.pathname);

	if (
		!exempt &&
		CSRF_METHODS.includes(request.method) &&
		isFormContentType(request) &&
		request.headers.get('origin') !== url.origin
	) {
		const message = `Cross-site ${request.method} form submissions are forbidden`;
		return request.headers.get('accept') === 'application/json'
			? Response.json({ message }, { status: 403 })
			: new Response(message, { status: 403 });
	}

	return resolve(event);
};

// Gives the request its own database connection, on the platforms that require
// one. A Cloudflare Worker cannot use a socket opened by an earlier request, so
// a shared client makes every request after the first on a given isolate fail
// instantly — see the comment in `$lib/server/db`. Everywhere else this is a
// pass-through and the process-wide client stands.
//
// It runs second, immediately inside the security headers, because everything
// after it queries: Better Auth resolves the session, and the API guard reads
// keys. Nothing between here and the loads may open a connection of its own.
const databaseScopeHandler: Handle = ({ event, resolve }) => {
	const ctx = event.platform?.ctx;
	if (!needsRequestScopedDb(event.platform) || !ctx) return resolve(event);

	// Closing is deferred with `waitUntil` so the socket teardown happens after
	// the response has been handed back, not in front of it.
	//
	// A response that still queries while its body streams asks for that close to
	// wait — `holdUntilResponseComplete`, at the endpoint that streams (#684).
	// Deliberately not applied to every response here: most bodies are bytes, and
	// holding the connection until a slow client has downloaded a 200 MB file
	// would tie a Postgres socket to the visitor's bandwidth.
	//
	// The address is Hyperdrive's, when the binding is present. It pools
	// connections at the edge, so the Worker's TLS handshake terminates near the
	// visitor instead of at the database — the cost a page paying several queries
	// pays several times. Absent (local `wrangler dev` without the binding, or any
	// non-Worker run) the connection falls back to `DATABASE_URL`, unchanged.
	return withRequestScopedDb(
		async () => resolve(event),
		(closing) => ctx.waitUntil(closing),
		event.platform?.env?.HYPERDRIVE?.connectionString
	);
};

// Bot detection is applied to the public auth/API surface only. Known AI
// crawlers legitimately GET public pages (that is what indexing is), but they
// have no business submitting logins, registrations or invitations, so
// state-changing requests carrying a crawler User-Agent are rejected. This
// keeps crawler traffic out of the auth rate limits and the signup funnel.
// The User-Agent is self-declared and therefore spoofable: treat this as noise
// reduction, not as an access control — nothing else relies on it.
const BOT_GUARDED_PREFIXES = ['/api/auth', API_V1_PUBLIC_PREFIX];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The OAuth machine endpoints are the exception, and they are one on purpose.
// "Registration" above means a person signing up; `/api/auth/oauth2/register` is
// RFC 7591 *client* registration, where an automated client is not the abuse
// case but the only caller there will ever be. Guarding it rejects exactly the
// software we published an MCP server for: a client announcing itself as
// `Claude-User` or `ClaudeBot` was answered with 403 here, so connecting Claude
// failed at the first step with a message about crawlers.
//
// Narrow on purpose — sign-in, sign-up and invitations keep the guard, which is
// what it was written for.
const BOT_EXEMPT_PREFIXES = ['/api/auth/oauth2/'];
const isBotExempt = (pathname: string) =>
	BOT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const botDetectionHandler: Handle = async ({ event, resolve }) => {
	const isGuarded =
		BOT_GUARDED_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix)) &&
		!isBotExempt(event.url.pathname);

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

/**
 * Writes the user's organization onto a session that has none, and returns it.
 *
 * Only sessions created before sign-in started doing this reach here; for
 * everyone else the value is already on the session and this is never called.
 * Null when the user belongs to no organization — nothing to adopt.
 *
 * A failure here is not fatal: the request continues without an organization,
 * which is the behaviour it had before. It is logged rather than swallowed,
 * because a permanent failure would look exactly like the bug this fixes.
 */
async function adoptOrganizationForSession(
	headers: Headers,
	userId: string
): Promise<string | null> {
	let organizationId: string | null = null;

	try {
		// The lookup is inside the guard, not before it. The caller's own catch
		// covers the whole session block, so anything thrown here would drop
		// `locals.user` as well and sign the request out over a database hiccup —
		// a much worse failure than the missing organization it was reaching for.
		organizationId = await firstOrganizationFor(userId);
		if (!organizationId) return null;

		await auth.api.setActiveOrganization({ headers, body: { organizationId } });
		logger.info('Adopted organization for a session that had none', { userId, organizationId });
		return organizationId;
	} catch (error) {
		logger.warn('Could not set the active organization on an existing session', {
			userId,
			organizationId,
			reason: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

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

			// Get active organization from session, adopting one for sessions that
			// predate sign-in setting it.
			//
			// Without the second half, every session created before that change keeps
			// behaving as if its owner belonged to no organization until they sign out
			// and back in — including the ones we verify against, which would report
			// the bug as unfixed. Healing on the next request costs one indexed lookup
			// for a signed-in user with no active organization, and stops as soon as
			// the session row is written.
			const activeOrganizationId =
				session.session?.activeOrganizationId ??
				(await adoptOrganizationForSession(requestHeaders, session.user.id));

			if (activeOrganizationId) {
				event.locals.organizationId = activeOrganizationId;

				// The caller's role in that organization, read as one row.
				//
				// This used to go through `auth.api.listMembers`, which costs far more
				// than it looks: the endpoint resolves the session again on its own,
				// loads *every* member of the organization and counts them — and all of
				// it was thrown away by a `find` for the single row we wanted. On a
				// deployment whose database is a us-west-2 round trip away (~295 ms
				// measured) that was several of the ~23 auth queries a signed-in page
				// was spending before it rendered anything.
				//
				// Reading the row directly is the same value from the same table, with
				// no caching and nothing left valid for longer: strictly fewer
				// questions, identical answer.
				try {
					const [seat] = await db
						.select({ role: member.role })
						.from(member)
						.where(
							and(
								eq(member.organizationId, activeOrganizationId),
								eq(member.userId, session.user.id)
							)
						)
						.limit(1);

					event.locals.organizationRole = seat?.role ?? null;
				} catch (_e) {
					event.locals.organizationRole = null;
				}
			} else {
				// Belongs to no organization — the onboarding case, not a failure.
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
		if (pathname.startsWith(API_V1_PUBLIC_PREFIX) || isBearerApi(pathname)) {
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
 * Flattens an error's `cause` chain into something a log line can carry.
 *
 * Winston serialises an Error to its message and stack, and both stop at the
 * outermost error. Drizzle wraps every driver failure as `Failed query: <sql>`
 * and hangs the real one — the Postgres `code`, `severity` and `constraint_name`,
 * or the socket error underneath them — on `cause`. Without this, a production
 * 500 tells us which statement died and nothing whatsoever about why.
 *
 * Depth is capped because a cause chain can be cyclic.
 */
function causeChain(error: unknown): Record<string, unknown>[] {
	const chain: Record<string, unknown>[] = [];
	let current: unknown = error instanceof Error ? error.cause : undefined;

	for (let depth = 0; current && depth < 5; depth += 1) {
		if (current instanceof Error) {
			const extra = current as Error & { code?: unknown; severity?: unknown; routine?: unknown };
			chain.push({
				name: extra.name,
				message: extra.message,
				code: extra.code,
				severity: extra.severity,
				routine: extra.routine
			});
			current = extra.cause;
		} else {
			chain.push({ value: String(current) });
			current = undefined;
		}
	}

	return chain;
}

/**
 * Reports unexpected server errors to PostHog error tracking.
 *
 * Only 5xx-class failures are treated as errors: 4xx statuses are routine
 * (404s, rejected input) and would drown out real incidents. A no-op when
 * PostHog is not configured.
 */
export const handleError: HandleServerError = ({ error, status, message, event }) => {
	if (status >= 500) {
		logger.error('Unhandled server error', error, {
			pathname: event.url.pathname,
			status,
			causes: causeChain(error)
		});
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
	htmlCacheHandler, // Documents must never outlive the deploy that named their chunks
	csrfHandler, // Replaces kit's csrf.checkOrigin; exempts the OAuth token endpoint
	publicPageCacheHandler, // A hit here skips the database scope and auth entirely
	databaseScopeHandler, // Before anything that queries — auth does, on every request
	botDetectionHandler, // Reject crawlers before any auth/session work
	populateLocalsUserHandler, // Run this first to ensure locals.user is set
	({ event, resolve }) => svelteKitHandler({ auth, event, resolve, building: false }),
	apiProtectionHandler,
	paraglideHandle
);
