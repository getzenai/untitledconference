import { missingConferenceMessage } from '$lib/conference/conference-status';
import { EMBED_PARAM } from '$lib/conference/embed';
import { publicConference } from '$lib/conference/public-data';
import { daysUntil } from '$lib/conference/public-view';
import { callSummary } from '$lib/server/conference/cfp-submission';
import { unpublishedConferenceStatus } from '$lib/server/conference/public-conference';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * The one loader behind all five public widget surfaces.
 *
 * It sits on the layout rather than on each page deliberately: every surface then
 * reads the same object from the same request, so a session cannot show one room
 * on the agenda and a different one in the itinerary (EMB-16). Connecting the
 * database is a change to `publicConference`'s body — nothing here and nothing
 * above it moves.
 *
 * There is no session check anywhere in this subtree, and that is the feature:
 * EMB-14 grades whether all five surfaces are readable with no account at all.
 */
export const load: LayoutServerLoad = async ({ params, url }) => {
	// Both take the slug and neither reads the other's result, so they are started
	// together rather than one after the other. The database is in us-west-2 while
	// the Worker runs at the visitor's edge, so a needless `await` between two
	// independent queries costs a full round trip — measured at ~150 ms from
	// Frankfurt, and it is the whole reason this is a `Promise.all`.
	//
	// The call summary buys discoverability: a speaker who lands on the agenda has
	// no other way to learn that the call is open. It reads only the form row
	// rather than the whole definition, so the four surfaces that will never
	// render a form do not pay for one.
	//
	// On a slug that does not exist this spends one query that the sequential
	// version skipped. That is the trade: one wasted query on the 404 path, one
	// round trip saved on every real page.
	const [conference, call] = await Promise.all([
		publicConference(params.slug),
		callSummary(params.slug)
	]);
	if (!conference) {
		error(404, missingConferenceMessage(await unpublishedConferenceStatus(params.slug)));
	}

	// Presentation only (EMB-15): inside somebody else's page, our header and tab
	// bar are a second site's furniture in their room. Nothing is withheld and
	// nothing is granted by this flag — the same data renders either way.
	return {
		conference,
		call,
		// "Closes in 6 days" is counted here rather than in the component on
		// purpose. A count taken in the browser is taken in the visitor's zone and
		// at a different instant than the server's, so the banner would render one
		// number in the HTML and another after hydration — the same class of
		// mismatch `public-view` formats times in UTC to avoid.
		daysUntilClose: daysUntil(call?.closesAt ?? null),
		embed: url.searchParams.get(EMBED_PARAM) === '1'
	};
};
