/**
 * The run-of-show page (#449). Organizer-only: the file links are the same
 * downloads as the files library, and a public copy would be a second leak
 * surface. `+page.server.ts` does run the layout load, but the CSV export's
 * lesson still applies — a route that is only protected because of where it
 * sits is protected by a coincidence. Ask here.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { runOfShowFor } from '$lib/server/conference/run-of-show';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	return {
		conference,
		talks: await runOfShowFor(conference.id)
	};
};
