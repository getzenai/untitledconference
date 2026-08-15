import { organizedConferences, requireOrganizer } from '$lib/server/conference/access';
import { organizationForNewConference } from '$lib/server/conference/create-conference';
import { setConferencePredecessor, withEditionLinks } from '$lib/server/conference/predecessor';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { error, fail, isHttpError } from '@sveltejs/kit';
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
	const conferences = withEditionLinks(await organizedConferences(locals.user!.id));

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

function editionId(value: FormDataEntryValue | null): number | null {
	const raw = String(value ?? '').trim();
	if (raw === '' || raw === 'none') return null;
	const id = Number(raw);
	return Number.isInteger(id) && id > 0 ? id : NaN;
}

/**
 * The same `requireOrganizer` gate the page itself uses, by id.
 *
 * The form posts ids. Looking the slug up and asking again is how the
 * predecessor is held to the same boundary as the conference being edited:
 * a scoped organizer cannot name an edition they would 404 on.
 */
async function organizedEdition(userId: string, id: number) {
	const [row] = await db
		.select({ slug: conferenceTable.slug })
		.from(conferenceTable)
		.where(eq(conferenceTable.id, id))
		.limit(1);
	if (!row) throw error(404, 'Conference not found');
	return requireOrganizer(userId, row.slug);
}

/**
 * Same gate as `organizedEdition`, but a missing or unauthorized predecessor
 * is the inline `not_found` the form already uses for a foreign org — not a
 * 404 page. The conference being edited still 404s: that one they should
 * not have been posting about at all.
 */
async function organizedPredecessor(userId: string, id: number) {
	try {
		return await organizedEdition(userId, id);
	} catch (cause) {
		if (isHttpError(cause) && cause.status === 404) return null;
		throw cause;
	}
}

export const actions: Actions = {
	/**
	 * Name or clear the previous edition (#448). Empty `predecessorId` is the
	 * clear. The list is the form path because the relationship lives between
	 * two conferences, not inside one conference's settings.
	 */
	predecessor: async ({ locals, request }) => {
		const form = await request.formData();
		const conferenceId = editionId(form.get('conferenceId'));
		const predecessorId = editionId(form.get('predecessorId'));

		if (conferenceId === null || Number.isNaN(conferenceId) || Number.isNaN(predecessorId)) {
			return fail(400, { conferenceId, error: predecessorError('not_found') });
		}

		const { conference } = await organizedEdition(locals.user!.id, conferenceId);
		if (predecessorId !== null) {
			const predecessor = await organizedPredecessor(locals.user!.id, predecessorId);
			if (!predecessor) {
				return fail(400, { conferenceId, error: predecessorError('not_found') });
			}
		}

		const result = await setConferencePredecessor(conference.id, predecessorId);
		if (!result.ok) {
			return fail(400, { conferenceId, error: predecessorError(result.reason) });
		}
		return { conferenceId, saved: true };
	}
};
