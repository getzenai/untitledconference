import { organizedConferences, requireOrganizer } from '$lib/server/conference/access';
import { organizationForNewConference } from '$lib/server/conference/create-conference';
import { setConferencePredecessor, withEditionLinks } from '$lib/server/conference/predecessor';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// No shortcut past this page when there is exactly one conference.
	//
	// It used to redirect straight into that conference, which read as a
	// convenience and behaved as a trap: "My conferences" could not be looked at,
	// and every entry point living on it — including "New conference" — became
	// unreachable the moment an organizer had their first event. A list of one
	// with a visible button is the honest state.
	const conferences = await withEditionLinks(await organizedConferences(locals.user!.id));

	// Whether the page offers "create a conference" or "create an organization
	// first". This is the page a new organizer lands on, and it used to send them
	// back to the dashboard from an empty list — a dead end with a polite tone.
	const canCreate = (await organizationForNewConference(locals.user!.id)) !== null;

	return { conferences, canCreate };
};

function predecessorError(reason: 'not_found' | 'self' | 'cycle'): string {
	if (reason === 'self') return 'A conference cannot follow itself.';
	if (reason === 'cycle') return 'That would loop the editions.';
	return 'That conference is not an earlier edition you can name.';
}

export const actions: Actions = {
	/**
	 * Name or clear the previous edition (#448). Empty `predecessorId` is the
	 * clear. The list is the form path because the relationship lives between
	 * two conferences, not inside one conference's settings.
	 */
	predecessor: async ({ locals, request }) => {
		const form = await request.formData();
		const conferenceId = Number(form.get('conferenceId'));
		const raw = String(form.get('predecessorId') ?? '').trim();
		const predecessorId = raw === '' || raw === 'none' ? null : Number(raw);

		if (!Number.isInteger(conferenceId) || conferenceId <= 0) {
			return fail(400, { conferenceId, error: predecessorError('not_found') });
		}
		if (predecessorId !== null && (!Number.isInteger(predecessorId) || predecessorId <= 0)) {
			return fail(400, { conferenceId, error: predecessorError('not_found') });
		}

		const [row] = await db
			.select({ slug: conferenceTable.slug })
			.from(conferenceTable)
			.where(eq(conferenceTable.id, conferenceId))
			.limit(1);
		if (!row) throw error(404, 'Conference not found');
		const { conference } = await requireOrganizer(locals.user!.id, row.slug);

		const result = await setConferencePredecessor(conference.id, predecessorId);
		if (!result.ok) {
			return fail(400, { conferenceId, error: predecessorError(result.reason) });
		}
		return { conferenceId, saved: true };
	}
};
