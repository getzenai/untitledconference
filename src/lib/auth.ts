import { oauthProvider } from '@better-auth/oauth-provider';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { jwt } from 'better-auth/plugins/jwt';
import { organization } from 'better-auth/plugins/organization';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { organizationAccessControl, organizationRoles } from './auth/permissions';
import { buildRateLimitConfig } from './auth/rate-limit-config';
import {
	INVITATION_EXPIRY_SECONDS,
	SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
	SESSION_FRESH_AGE_SECONDS
} from './constants';
import { acceptReviewerInvitation } from './server/conference/reviewer-roster';
import { db } from './server/db';
import * as schema from './server/db/auth-schema';
import { serverEnv } from './server/env';
import { createLogger } from './server/logger';
import { normalizeEmail } from './server/services/email-address';
import {
	generatePasswordResetEmailContent,
	generateVerificationEmailContent,
	sendEmail
} from './server/services/email-service';
import { captureInvitationLink } from './server/services/invitation-link';
import { markInvitationAsAccepted } from './server/services/system-invitation';

const logger = createLogger('Auth');

/**
 * Checks if a password reset URL is for an invitation
 */
function isInvitation(url: string): boolean {
	const callbackURL = new URL(url).searchParams.get('callbackURL');
	return callbackURL?.includes('/complete-registration') ?? false;
}

/**
 * Hands a freshly generated invitation link to the admin action that asked for
 * it, and records that it was generated.
 *
 * The link carries a live reset token, so it is passed in memory (see
 * `invitation-link.ts`) and never written to a column. The row keeps only the
 * timestamp the invitations list shows.
 */
async function handOffInvitationLink(rawEmail: string, url: string) {
	const email = normalizeEmail(rawEmail);
	captureInvitationLink(email, url);
	await db
		.update(schema.systemInvitation)
		.set({
			lastGeneratedAt: new Date(),
			updatedAt: new Date()
		})
		.where(
			and(eq(schema.systemInvitation.email, email), isNull(schema.systemInvitation.acceptedAt))
		);
	logger.info('Invitation link generated', { email });
}

/**
 * Sends password reset email
 */
async function sendPasswordResetEmail(email: string, url: string) {
	const { subject, text, html } = generatePasswordResetEmailContent(url, email);
	await sendEmail({
		to: email,
		subject,
		text,
		html
	});
}

/**
 * The organization a new session starts in: the user's oldest membership.
 *
 * Null when they belong to none — that is the onboarding case, not an error.
 *
 * Ordered by `createdAt` and then `id`. The second key is not decoration: the
 * seed writes several memberships with one timestamp, and "whichever row the
 * database happened to return" is not a rule anybody can reason about when the
 * answer differs between two runs.
 */
export async function firstOrganizationFor(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ organizationId: schema.member.organizationId })
		.from(schema.member)
		.where(eq(schema.member.userId, userId))
		.orderBy(asc(schema.member.createdAt), asc(schema.member.id))
		.limit(1);

	return row?.organizationId ?? null;
}

/**
 * Checks if this is the first user (with transaction locking)
 */
async function checkIsFirstUserWithLock(
	tx: PostgresJsDatabase<typeof schema> | Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<boolean> {
	const [userCount] = await tx.select({ count: count() }).from(schema.user);

	return userCount.count === 0;
}

/**
 * Gets user role from system invitation
 */
async function getRoleFromInvitation(
	tx: PostgresJsDatabase<typeof schema> | Parameters<Parameters<typeof db.transaction>[0]>[0],
	email: string
): Promise<string | null> {
	const [invitation] = await tx
		.select()
		.from(schema.systemInvitation)
		.where(
			and(eq(schema.systemInvitation.email, email), isNull(schema.systemInvitation.acceptedAt))
		)
		.limit(1);

	return invitation?.role || null;
}

/**
 * Logs successful user creation with assigned role
 */
function logUserCreationWithRole(user: { email: string; role?: string }) {
	logger.info('User created successfully', { email: user.email, role: user.role });
}

const DEFAULT_TRUSTED_ORIGINS = [
	'http://127.0.0.1:5173',
	'http://localhost:5173',
	'http://127.0.0.1:5174',
	'http://localhost:5174'
];

function resolveTrustedOrigins(configured: string | undefined): string[] {
	if (!configured) return DEFAULT_TRUSTED_ORIGINS;
	const origins = configured
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	return origins.length > 0 ? origins : DEFAULT_TRUSTED_ORIGINS;
}

/**
 * Registrable domain for WebAuthn. Derived from the configured base URL
 * (stripping "www."); override with BETTER_AUTH_PASSKEY_RP_ID on deeper
 * subdomain deployments, where the derived value would bind passkeys to that
 * subdomain only. NOTE: changing rpID invalidates all registered passkeys.
 */
function resolvePasskeyRpId(origin: string, override: string | undefined): string {
	const configured = override?.trim();
	if (configured) return configured;
	try {
		return new URL(origin).hostname.replace(/^www\./, '');
	} catch {
		logger.warn('Could not derive passkey rpID from base URL, falling back to localhost', {
			origin
		});
		return 'localhost';
	}
}

/**
 * Reduce configured origins to canonical `scheme://host[:port]` form for
 * WebAuthn's exact-match origin comparison, dropping unparseable entries.
 * Returns undefined when nothing is usable, which makes the passkey plugin fall
 * back to the request's Origin header (local dev).
 */
function canonicalizeOrigins(origins: string[]): string[] | undefined {
	const canonical = origins.flatMap((value) => {
		try {
			return [new URL(value).origin];
		} catch {
			logger.warn('Ignoring unparseable trusted origin for passkey verification', { value });
			return [];
		}
	});
	return canonical.length > 0 ? canonical : undefined;
}

/**
 * Scopes the OAuth provider can issue. Kept in one place so the plugin config,
 * the consent screen and the RFC 9728 protected-resource metadata
 * (`scopes_supported`) cannot drift apart.
 *
 * `mcp:tools` gates the MCP endpoint: /api/v1/mcp requires it on the access
 * token, so an identity-only token (openid/profile/email) cannot call tools.
 */
export const OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'mcp:tools'];

/**
 * Origin this auth server is reachable at, and the `iss` of every token it signs.
 *
 * A function, not a constant: `serverEnv()` resolves (and throws on) required
 * env vars on first call, while `vite build` runs without an environment.
 * Anything at module scope would break the build.
 */
export function getServerOrigin(): string {
	return serverEnv().BETTER_AUTH_URL;
}

/**
 * Audience / resource identifier of the MCP endpoint. OAuth access tokens are
 * issued bound to this audience (RFC 8707 `resource` parameter) and verified
 * against it by the /api/v1/mcp route, so a token minted for another resource
 * cannot be replayed against the MCP server. Also the `resource` value of the
 * RFC 9728 /.well-known/oauth-protected-resource metadata.
 *
 * Lazy for the same reason as getServerOrigin().
 */
export function getMcpResource(): string {
	return `${getServerOrigin()}/api/v1/mcp`;
}

type Auth = ReturnType<typeof createAuth>;
let _auth: Auth | undefined;

function createAuth() {
	// Lazy by construction: `auth` below is a Proxy, so the environment is only
	// read (and validated) on first use — never during `vite build`.
	const env = serverEnv();
	const trustedOrigins = resolveTrustedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS);
	const serverOrigin = getServerOrigin();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'pg'
		}),

		appName: 'SvelteKitVibeStarter',
		secret: env.BETTER_AUTH_SECRET,
		baseURL: serverOrigin,
		trustedOrigins,

		// The jwt plugin's /token endpoint would let any session-cookie holder mint
		// a signed JWT outside the OAuth consent flow. Access tokens must only be
		// issued through /oauth2/token (PKCE + consent).
		disabledPaths: ['/token'],

		// Undefined (Better Auth defaults) unless RELAX_AUTH_RATE_LIMIT is set,
		// which only E2E runs do. See buildRateLimitConfig for the rationale.
		rateLimit: buildRateLimitConfig({ RELAX_AUTH_RATE_LIMIT: env.RELAX_AUTH_RATE_LIMIT }),

		// Make the session "freshness" window explicit (Better Auth's default is
		// the same 24h). Sensitive operations such as passkey registration require
		// a session created within this window; the UI reads the same constant via
		// isSessionFresh() to prompt for re-authentication up front instead of
		// failing the ceremony.
		//
		// cookieCache keeps the resolved session in a signed cookie so the one
		// getSession on the page path (#271) does not cross the Atlantic to
		// Postgres on every click. maxAge is SESSION_COOKIE_CACHE_MAX_AGE_SECONDS
		// — Better Auth's 5-minute default, justified there.
		session: {
			freshAge: SESSION_FRESH_AGE_SECONDS,
			cookieCache: {
				enabled: true,
				maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS
			}
		},

		emailAndPassword: {
			enabled: true,
			requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
			autoSignIn: true,
			resetPasswordTokenExpiresIn: INVITATION_EXPIRY_SECONDS,
			sendResetPassword: async ({ user, url }) => {
				if (isInvitation(url)) {
					await handOffInvitationLink(user.email, url);
				} else {
					await sendPasswordResetEmail(user.email, url);
				}
			},
			onPasswordReset: async ({ user }) => {
				logger.info('Password reset completed', { email: user.email });
				await markInvitationAsAccepted(user.email);
			}
		},

		emailVerification: {
			sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				const verificationUrl = new URL(url);
				verificationUrl.searchParams.set('callbackURL', '/email-verified');
				const finalUrl = verificationUrl.toString();

				const { subject, text, html } = generateVerificationEmailContent(finalUrl, user.email);
				await sendEmail({
					to: user.email,
					subject,
					text,
					html
				});
			}
		},

		socialProviders: {},

		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						logger.debug('Before user creation', { email: user.email });

						let role: string | undefined;

						await db.transaction(async (tx) => {
							const isFirstUser = await checkIsFirstUserWithLock(tx);
							if (isFirstUser) {
								logger.info('First user detected, will be admin', { email: user.email });
								role = 'admin';
							} else {
								const invitationRole = await getRoleFromInvitation(tx, user.email);
								if (invitationRole) {
									logger.info('User from system invitation', {
										email: user.email,
										role: invitationRole
									});
									role = invitationRole;
								}
							}
						});

						if (role) {
							return {
								data: {
									...user,
									role
								}
							};
						}

						return { data: user };
					},
					after: async (user) => {
						logUserCreationWithRole(user);
					}
				}
			},

			session: {
				create: {
					before: async (session) => {
						// Put the user's organization on the session at sign-in.
						//
						// Nothing did this before except accepting an invitation, so an
						// ordinary sign-in produced a session with no active organization —
						// and that is the state every "which organization am I in?" caller
						// mishandles: `getActiveMember` answers 400, `locals.organizationId`
						// stays null, and a member of one organization is treated as a member
						// of none. The 500 on /settings/organization/new was this, surfacing
						// two redirects away from its cause.
						const organizationId = await firstOrganizationFor(session.userId);
						if (!organizationId) return;

						return { data: { ...session, activeOrganizationId: organizationId } };
					}
				}
			}
		},

		plugins: [
			organization({
				allowUserToCreateOrganization: true,
				// Organization deletion is enabled by Better Auth's default; the knob
				// to turn it off is `disableOrganizationDeletion: true`.
				//
				// Set explicitly rather than left undefined. When undefined, Better
				// Auth derives it: reading or accepting an invitation requires a
				// verified email unless invitation IDs are the built-in opaque ones
				// (no `advanced.generateId`, and `advanced.database.generateId` unset
				// or 'uuid'). We take that exemption today, so the derived value is
				// already false — but it ties an auth rule to an unrelated
				// ID-generation setting, and a fork that later sets
				// `advanced.generateId` would silently start demanding verified
				// emails with nothing in its diff to explain it. Requiring
				// verification is a product decision; make it deliberately.
				requireEmailVerificationOnInvitation: false,
				schema: {
					invitation: {
						additionalFields: {
							conferenceId: { type: 'number', required: false, input: false }
						}
					}
				},
				ac: organizationAccessControl,
				roles: organizationRoles,
				organizationHooks: {
					afterAcceptInvitation: async ({ invitation, user, organization }) => {
						if (typeof invitation.conferenceId !== 'number') return;
						await acceptReviewerInvitation(invitation.conferenceId, organization.id, user.id);
					}
				},
				async sendInvitationEmail(data) {
					logger.info('Invitation created', { email: data.email, id: data.id });
				}
			}),
			admin({
				defaultRole: 'user',
				adminRoles: ['admin'],
				bannedUserMessage: 'Your account has been suspended. Please contact support.'
			}),
			passkey({
				rpID: resolvePasskeyRpId(serverOrigin, env.BETTER_AUTH_PASSKEY_RP_ID),
				rpName: 'SvelteKitVibeStarter',
				// Pin expected WebAuthn origins to our trusted origins. WebAuthn
				// compares origins by exact string match, so canonicalize them.
				origin: canonicalizeOrigins(trustedOrigins)
			}),
			// Signs OAuth access/id tokens and serves the JWKS (/api/auth/jwks).
			// Required by the oauth-provider plugin.
			jwt({
				jwt: {
					// Issue tokens with the bare origin as `iss` (not the /api/auth
					// basePath) so RFC 8414 discovery lives at the server root
					// (src/routes/.well-known/*) where OAuth clients look for it.
					issuer: serverOrigin
				},
				// Don't attach session JWTs to responses via the set-auth-jwt header;
				// tokens are only issued through the OAuth token endpoint.
				disableSettingJwtHeader: true
			}),
			// OAuth 2.1 authorization server (authorization code + PKCE + consent).
			oauthProvider({
				loginPage: '/login',
				consentPage: '/oauth/consent',
				scopes: OAUTH_SCOPES,
				// Access tokens are JWTs bound to the MCP endpoint's audience. Without
				// this the plugin would reject the `resource` parameter MCP clients
				// send, and tokens would carry no `aud` for /api/v1/mcp to check.
				validAudiences: [getMcpResource()],
				accessTokenExpiresIn: 60 * 60, // 1 hour
				refreshTokenExpiresIn: 60 * 60 * 24 * 30, // 30 days
				// Off by default: RFC 7591 self-registration lets anyone create a
				// client, which is only appropriate for deployments that need it
				// (e.g. MCP clients). Opt in with OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION.
				allowDynamicClientRegistration: env.OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION,
				allowUnauthenticatedClientRegistration: env.OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION,
				// The root well-known routes exist (src/routes/.well-known), so the
				// boot-time reminders to create them are noise.
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true
				}
			})
		]
	});
}

export const auth: Auth = new Proxy({} as Auth, {
	get(_, prop, receiver) {
		if (!_auth) _auth = createAuth();
		return Reflect.get(_auth, prop, receiver);
	}
});
