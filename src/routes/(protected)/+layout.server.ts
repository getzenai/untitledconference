import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, locals }) => {
	// The svelteKitHandler from better-auth in hooks.server.ts should populate locals.user
	const user = locals.user;

	if (!user) {
		// If user is not logged in (i.e., locals.user is not set by the auth hook),
		// redirect to login page with return URL.
		throw redirect(303, `/login?returnTo=${url.pathname}`);
	}

	// User is available from locals, pass it to the layout and child pages
	return {
		user // This makes `data.user` available to Svelte components
	};
};
