import { navAccess } from '$lib/server/conference/nav-access';
import { createLogger } from '$lib/server/logger';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

const logger = createLogger('AdminLayout');

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Check if user is authenticated
	const user = locals.user;

	if (!user) {
		logger.debug('No user found, redirecting to login');
		throw redirect(303, `/login?returnTo=${url.pathname}`);
	}

	// Check if user is admin
	if (!locals.isAdmin) {
		logger.debug('User is not admin, redirecting to home');
		throw redirect(303, '/home');
	}

	logger.debug('Admin access granted for user: ' + user.email);

	return {
		user,
		isAdmin: true,
		// The admin chrome renders the same AppSidebar, so it owes it the same data
		// (#239). A platform admin is not automatically an organizer: the flags are
		// their own relations, and `NavAdmin` is what carries the admin links.
		navAccess: await navAccess(user.id)
	};
};
