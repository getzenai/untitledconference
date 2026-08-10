/**
 * Team & reviewers — starts with committee visibility (#63).
 *
 * Full roster management is later work; this page is the correct home for
 * settings that govern how the review committee works with each other.
 */
import type { ReviewVisibility } from '$lib/conference/review-visibility';
import { requireOrganizer } from '$lib/server/conference/access';
import { db } from '$lib/server/db';
import { conferenceTable } from '$lib/server/db/conference/conference-schema';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const MODES: ReviewVisibility[] = ['open', 'blind_until_reviewed'];

export const load: PageServerLoad = async ({ locals, params }) => {
	await requireOrganizer(locals.user!.id, params.slug);
	return {};
};

export const actions: Actions = {
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
