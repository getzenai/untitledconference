import { publicConference } from '$lib/conference/public-data';
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
export const load: LayoutServerLoad = async ({ params }) => {
	const conference = await publicConference(params.slug);
	if (!conference) error(404, 'No conference with that address');
	return { conference };
};
