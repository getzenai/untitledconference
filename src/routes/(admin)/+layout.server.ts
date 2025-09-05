import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		console.debug('[Admin Layout] No user found, redirecting to login');
		throw redirect(303, `/login?returnTo=${url.pathname}`);
	}

	// Check if user is admin
	if (!locals.isAdmin) {
		console.debug('[Admin Layout] User is not admin, redirecting to home');
		throw redirect(303, '/home');
	}

	console.debug('[Admin Layout] Admin access granted for user:', user.email);

	return {
		user,
		isAdmin: true
	};
};
