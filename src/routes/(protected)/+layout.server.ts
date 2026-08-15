import type { NavAccess } from '$lib/conference/nav-access';
import { navAccess } from '$lib/server/conference/nav-access';
import { isFeatureEnabled } from '$lib/server/feature-flags';
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
	// AppSidebar now lives on this layout so it stays mounted across
	// /home ↔ /manage/<slug> (#410). The flags used to load only under
	// `(with-sidebar)` to spare conference pages a query they did not read;
	// those pages render the same rail now, so they owe it the same data.
	//
	// Optional on the *type* so page unit tests under /manage/<slug> do not
	// all have to invent a navAccess fixture for a field they never read.
	//
	// `chatEnabled` rides along for the same reason and stays optional for the
	// same one: the assistant star (#676) hangs on this layout, and without the
	// flag `POST /chat` answers 404, so the button must not be there either.
	const shell: { navAccess?: NavAccess; chatEnabled?: boolean } = {
		navAccess: await navAccess(user.id, user.email ?? null),
		chatEnabled: isFeatureEnabled('inAppChat')
	};
	return {
		user,
		...shell
	};
};
