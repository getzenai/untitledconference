/**
 * Team & reviewers — committee visibility (#63) and who is on the committee.
 *
 * The roster half is what makes the visibility half mean anything: a reviewer
 * exists only as a `membership` row, and until this page could write one, no
 * conference outside the demo seed had anybody to assign.
 */
import type { ReviewVisibility } from '$lib/conference/review-visibility';
import { requireOrganizer } from '$lib/server/conference/access';
import { addReviewer, committee, removeReviewer } from '$lib/server/conference/reviewer-roster';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const MODES: ReviewVisibility[] = ['open', 'blind_until_reviewed'];

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	return { committee: await committee(conference.id) };
};

export const actions: Actions = {
	addReviewer: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const email = String((await request.formData()).get('email') ?? '');

		const result = await addReviewer(conference.id, email);
		if (!result.ok) return fail(400, { message: result.message });

		return { message: `${result.name} can now be assigned submissions to review.` };
	},

	removeReviewer: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('membershipId'));

		if (!Number.isInteger(id)) return fail(400, { message: 'Unknown committee member.' });

		const result = await removeReviewer(conference.id, id);
		if (!result.ok) return fail(400, { message: 'Unknown committee member.' });

		return { message: 'Removed from the committee. Reviews they already filed are kept.' };
	},

	reviewVisibility: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const mode = String((await request.formData()).get('mode')) as ReviewVisibility;

		if (!MODES.includes(mode)) return fail(400, { message: 'Unknown review mode.' });

		await db
			.update(conferenceTable)
			.set({ reviewVisibility: mode })
			.where(eq(conferenceTable.id, conference.id));

		return {
			message:
				mode === 'open'
					? 'Reviewers now see each other’s scores and comments at any time.'
					: 'Reviewers now see each other’s scores and comments only after filing their own.'
		};
	}
};
