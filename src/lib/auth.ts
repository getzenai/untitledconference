import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { organization } from 'better-auth/plugins/organization';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { INVITATION_EXPIRY_SECONDS } from './constants';
import { db } from './server/db';
import * as schema from './server/db/auth-schema';
import { markInvitationAsAccepted } from './server/services/system-invitation';

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
	console.log('[Auth] Invitation link stored for:', email);
}

/**
 * Logs password reset request (placeholder for future email implementation)
 */
async function logPasswordResetRequest(email: string, url: string) {
	console.log('[Auth] Password reset requested for:', email);
	console.log('[Auth] Reset URL:', url);
	// TODO: Implement email sending for regular password resets
	// await sendEmail({
	//   to: email,
	//   subject: 'Reset Your Password',
	//   html: `<p><a href="${url}">Reset your password</a></p>`
	// });
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
	console.log('[Auth Hook] User created successfully:', user.email, 'Role:', user.role);
}

// The Drizzle adapter for Better Auth uses the provided db instance.
// It infers table structures from the schema associated with this db instance.
// No explicit table object imports are needed here for basic setup.
export const auth = betterAuth({
	// Database Adapter Configuration
	database: drizzleAdapter(db, {
		provider: 'pg'
	}),

	// Core Settings - Refer to Better Auth documentation for all available options
	appName: 'SvelteKitVibeStarter',
	secret: env.BETTER_AUTH_SECRET || '',
	baseURL: env.BETTER_AUTH_URL || 'http://localhost:5173', // Provide fallback URL
	trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS
		? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((origin) => origin.trim())
		: [
				'http://127.0.0.1:5173',
				'http://localhost:5173',
				'http://127.0.0.1:5174',
				'http://localhost:5174'
			],

	// Email & Password Authentication
	emailAndPassword: {
		enabled: true,
		autoSignIn: true, // Explicitly enable auto-signin after signup
		resetPasswordTokenExpiresIn: INVITATION_EXPIRY_SECONDS, // Use centralized config
		sendResetPassword: async ({ user, url }) => {
			// Check if this is an invitation reset or a regular password reset
			if (isInvitation(url)) {
				// INVITATION PATH: Store the reset link in the system_invitation table
				await storeInvitationResetLink(user.email, url);
			} else {
				// REGULAR PASSWORD RESET PATH: Log for now (email implementation pending)
				await logPasswordResetRequest(user.email, url);
			}
		},
		onPasswordReset: async ({ user }) => {
			// Mark invitation as accepted when password is reset (user completes registration)
			console.log('[Auth] Password reset completed for:', user.email);
			await markInvitationAsAccepted(user.email);
		}
	},

	// Database Hooks for server-side logic during user operations
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					console.log('[Auth Hook] Before user creation:', user.email);

					let role: string | undefined;

					// Use transaction to prevent race condition
					await db.transaction(async (tx) => {
						// Check if this is the first user
						const isFirstUser = await checkIsFirstUserWithLock(tx);
						if (isFirstUser) {
							console.log('[Auth Hook] First user detected, will be admin');
							role = 'admin';
						}
						// Check if user has a system invitation
						else {
							const invitationRole = await getRoleFromInvitation(tx, user.email);
							if (invitationRole) {
								console.log('[Auth Hook] User from system invitation, role:', invitationRole);
								role = invitationRole;
							}
							// else: role remains undefined, admin plugin will set default role
						}
					});

					// Only override the role if we have a specific one to set
					if (role) {
						return {
							data: {
								...user,
								role
							}
						};
					}

					// Let the admin plugin handle the default role
					return { data: user };
				},
				after: async (user) => {
					// Log successful user creation
					logUserCreationWithRole(user);
					// Don't mark invitation as accepted here - wait for password reset completion
				}
			}
		}
	},

	// Plugins - Add organization and admin plugins
	plugins: [
		organization({
			// Allow anyone to create organizations
			allowUserToCreateOrganization: true,
			// Allow organization deletion
			allowOrganizationDelete: true,
			// We're not sending invitation emails, users copy and share the link
			async sendInvitationEmail(data) {
				// In a real app, you would send an email here
				// For now, we'll just log it and rely on the copy link functionality
				console.log('Invitation created for:', data.email, 'ID:', data.id);
			}
		}),
		admin({
			// Default role for new users
			defaultRole: 'user',
			// Roles considered as admin
			adminRoles: ['admin'],
			// Custom banned user message
			bannedUserMessage: 'Your account has been suspended. Please contact support.'
		})
	]
});
