/**
 * What the organizer is still waiting for, per speaker (CNT-06..09, SPK-10).
 */
import { requireOrganizer } from '$lib/server/conference/access';
import { contentOverview, contentTotals } from '$lib/server/conference/organizer-content';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return {
		conference,
		speakers: await contentOverview(conference.id),
		totals: await contentTotals(conference.id)
	};
};
