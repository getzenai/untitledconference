import { requireOrganizer } from '$lib/server/conference/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	await requireOrganizer(locals.user!.id, params.slug);

	// The origin is read from the request rather than configured, because the
	// snippet an organizer copies has to work from where they are standing: a
	// preview deployment, a custom domain and localhost are all correct answers,
	// and a build-time constant would be wrong on two of the three.
	return { origin: url.origin };
};
