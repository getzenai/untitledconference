import { EMBED_PARAM } from '$lib/conference/embed';
import { publicConference } from '$lib/conference/public-data';
import { callSummary } from '$lib/server/conference/cfp-submission';
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
	const conference = await publicConference(params.slug);
	if (!conference) error(404, 'No conference with that address');

	// One extra query, and it buys discoverability: a speaker who lands on the
	// agenda has no other way to learn that the call is open. `callSummary` reads
	// only the form row rather than the whole definition, so the four surfaces
	// that will never render a form do not pay for one.
	const call = await callSummary(params.slug);

	// Presentation only (EMB-15): inside somebody else's page, our header and tab
	// bar are a second site's furniture in their room. Nothing is withheld and
	// nothing is granted by this flag — the same data renders either way.
	return { conference, call, embed: url.searchParams.get(EMBED_PARAM) === '1' };
};
