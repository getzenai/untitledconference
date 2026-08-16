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
 * lying the moment a second organizer published. Each row carries `call` so
 * the page can mark an open CFP and aim *Explore a live conference* at one
 * without inventing a second window check (#709).
 *
 * `?home=0` is the way back out (#237). The redirect stays the default — that part
 * was right — but a signed-in user who follows a link to the product page, or wants
 * to re-read what this promises before recommending it, hit a wall with no way
 * around it. One bypass, spelled the way it reads: do not send me home.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user && url.searchParams.get('home') !== '0') redirect(303, '/home');

	return { conferences: await publicConferenceDirectory() };
};
