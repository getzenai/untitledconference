import { reviewedConferences } from '$lib/server/conference/reviewer';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const conferences = await reviewedConferences(locals.user!.id);

	// One conference is the normal case for a reviewer; a list of one is a click that
	// buys nothing.
	if (conferences.length === 1) redirect(303, `/review/${conferences[0].slug}`);

	return { conferences };
};
