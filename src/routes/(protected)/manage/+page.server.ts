import { organizedConferences } from '$lib/server/conference/access';
import { organizationForNewConference } from '$lib/server/conference/create-conference';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// No shortcut past this page when there is exactly one conference.
	//
	// It used to redirect straight into that conference, which read as a
	// convenience and behaved as a trap: "My conferences" could not be looked at,
	// and every entry point living on it — including "New conference" — became
	// unreachable the moment an organizer had their first event. A list of one
	// with a visible button is the honest state.
	const conferences = await organizedConferences(locals.user!.id);

	// Whether the page offers "create a conference" or "create an organization
	// first". This is the page a new organizer lands on, and it used to send them
	// back to the dashboard from an empty list — a dead end with a polite tone.
	const canCreate = (await organizationForNewConference(locals.user!.id)) !== null;

	return { conferences, canCreate };
};
