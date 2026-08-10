import { organizedConferences } from '$lib/server/conference/access';
import { organizationForNewConference } from '$lib/server/conference/create-conference';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const conferences = await organizedConferences(locals.user!.id);

	// One conference is the normal case; making the organizer pick from a list of one
	// is a click that buys nothing.
	if (conferences.length === 1) {
		redirect(303, `/manage/${conferences[0].slug}/submissions`);
	}

	// Whether the page offers "create a conference" or "create an organization
	// first". This is the page a new organizer lands on, and it used to send them
	// back to the dashboard from an empty list — a dead end with a polite tone.
	const canCreate = (await organizationForNewConference(locals.user!.id)) !== null;

	return { conferences, canCreate };
};
