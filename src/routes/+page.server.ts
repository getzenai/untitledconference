import { publicConferenceDirectory } from '$lib/conference/public-data';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The front door.
 *
 * A signed-in user still goes straight to `/home` — they came back to their work,
 * not to a marketing page. A visitor without a session used to be redirected to
 * `/login`, and that was a dead end: nothing reachable from the login form linked
 * a public conference site, so `/c/<slug>` was only findable by guessing the slug.
 * Every EMB scenario starts at the base URL with no account, so that redirect put
 * all five public surfaces out of reach regardless of how well they worked.
 *
 * It lists rather than redirects to the single conference on purpose. The app is
 * multi-tenant — a redirect would have to pick a favourite, and would start
 * lying the moment a second organizer published.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/home');

	return { conferences: await publicConferenceDirectory() };
};
