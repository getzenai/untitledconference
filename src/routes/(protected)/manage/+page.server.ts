import { organizedConferences } from '$lib/server/conference/access';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const conferences = await organizedConferences(locals.user!.id);

	// One conference is the normal case; making the organizer pick from a list of one
	// is a click that buys nothing.
	if (conferences.length === 1) {
		redirect(303, `/manage/${conferences[0].slug}/submissions`);
	}

	return { conferences };
};
