import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$env/static/private';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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
	secret: BETTER_AUTH_SECRET,
	origin: BETTER_AUTH_URL, // Using 'origin' based on documentation review

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
	}

	// Plugins - Add any Better Auth plugins you intend to use
	// plugins: [
	//   // examplePlugin()
	// ],

	// Add any other necessary configurations for Better Auth here
	// For example, session duration, JWT settings, email verification settings, etc.
});
