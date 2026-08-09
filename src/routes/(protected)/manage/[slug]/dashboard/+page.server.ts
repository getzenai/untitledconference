import { requireOrganizer } from '$lib/server/conference/access';
import { conferenceDashboard } from '$lib/server/conference/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	return { dashboard: await conferenceDashboard(conference.id) };
};
