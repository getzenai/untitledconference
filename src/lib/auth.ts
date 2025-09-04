import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { organization } from 'better-auth/plugins/organization';
import { db } from './server/db';

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
	origin: env.BETTER_AUTH_URL || '', // Using 'origin' based on documentation review

	// Email & Password Authentication
	emailAndPassword: {
		enabled: true
		// autoSignIn: true, // Defaults to true, users are signed in after successful signup
	},

	// Social Providers Configuration
	socialProviders: {
		// Example for GitHub - uncomment and configure if you use it
		// github: {
		//   clientId: process.env.GITHUB_CLIENT_ID!, // Ensure these are in $env/static/private if used
		//   clientSecret: process.env.GITHUB_CLIENT_SECRET!, // Ensure these are in $env/static/private if used
		// },
		// Add other providers like Google, Apple, etc., as needed
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

	// Add any other necessary configurations for Better Auth here
	// For example, session duration, JWT settings, email verification settings, etc.
});
