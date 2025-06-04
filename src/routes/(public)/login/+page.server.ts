// Removed: import { auth } from '$lib/auth';
import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const load: ServerLoad = async ({ locals }) => {
	// locals.user should be populated by the populateLocalsUserHandler in hooks.server.ts
	const user = locals.user;

	console.log('[Login Page Load] Checking if user is already logged in (from locals)');
	console.log('[Login Page Load] User from locals:', user);

	if (user) {
		console.log('[Login Page Load] User is already logged in (from locals), redirecting to /home');
		// If user is already logged in, redirect to home page
		throw redirect(303, '/home');
	}

	console.log('[Login Page Load] No user found in locals, allowing access to login page');
	return {};
};
