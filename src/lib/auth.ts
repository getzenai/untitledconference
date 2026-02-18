import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { organization } from 'better-auth/plugins/organization';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { INVITATION_EXPIRY_SECONDS } from './constants';
import { config } from './server/config';
import { db } from './server/db';
import * as schema from './server/db/auth-schema';
import { createLogger } from './server/logger';
import {
	generatePasswordResetEmailContent,
	generateVerificationEmailContent,
	sendEmail
} from './server/services/email-service';
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
 * Stores invitation reset link in database
 */
async function storeInvitationResetLink(email: string, url: string) {
	await db
		.update(schema.systemInvitation)
		.set({
			resetLink: url,
			lastGeneratedAt: new Date(),
			updatedAt: new Date()
		})
		.where(
			and(eq(schema.systemInvitation.email, email), isNull(schema.systemInvitation.acceptedAt))
		);
	logger.info('Invitation link stored', { email });
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

type Auth = ReturnType<typeof createAuth>;
let _auth: Auth | undefined;

function createAuth() {
	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'pg'
		}),

		appName: 'SvelteKitVibeStarter',
		secret: config.betterAuthSecret,
		baseURL: config.betterAuthUrl,
		trustedOrigins: config.betterAuthTrustedOrigins
			? config.betterAuthTrustedOrigins.split(',').map((origin) => origin.trim())
			: [
					'http://127.0.0.1:5173',
					'http://localhost:5173',
					'http://127.0.0.1:5174',
					'http://localhost:5174'
				],

		emailAndPassword: {
			enabled: true,
			requireEmailVerification: config.requireEmailVerification,
			autoSignIn: true,
			resetPasswordTokenExpiresIn: INVITATION_EXPIRY_SECONDS,
			sendResetPassword: async ({ user, url }) => {
				if (isInvitation(url)) {
					await storeInvitationResetLink(user.email, url);
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
			sendOnSignUp: config.requireEmailVerification,
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
			}
		},

		plugins: [
			organization({
				allowUserToCreateOrganization: true,
				allowOrganizationDelete: true,
				async sendInvitationEmail(data) {
					logger.info('Invitation created', { email: data.email, id: data.id });
				}
			}),
			admin({
				defaultRole: 'user',
				adminRoles: ['admin'],
				bannedUserMessage: 'Your account has been suspended. Please contact support.'
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
