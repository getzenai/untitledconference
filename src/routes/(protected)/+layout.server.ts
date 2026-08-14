import { createLogger } from '$lib/server/logger';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

const logger = createLogger('ProtectedLayout');

export const load: LayoutServerLoad = async ({ url, locals }) => {
	// The svelteKitHandler from better-auth in hooks.server.ts should populate locals.user
	const user = locals.user;

	logger.debug('Checking user:', {
		hasUser: !!user,
		userId: user?.id,
		email: user?.email,
		pathname: url.pathname
	});

	if (!user) {
		// If user is not logged in (i.e., locals.user is not set by the auth hook),
		// redirect to login page with return URL.
		logger.info('No user found, redirecting to login from:', url.pathname);
		throw redirect(303, `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	logger.debug('User authenticated, allowing access to:', url.pathname);
	// User is available from locals, pass it to the layout and child pages
	return {
		user // This makes `data.user` available to Svelte components
	};
};
