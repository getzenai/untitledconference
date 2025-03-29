import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// If user is not logged in, redirect to login page with return URL
	if (!locals.user) {
		throw redirect(303, `/login?returnTo=${url.pathname}`);
	}

	// Make user data available to all protected routes
	return {
		user: locals.user
	};
};
