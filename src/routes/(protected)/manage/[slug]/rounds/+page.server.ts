/**
 * Review rounds — the entry point the submission detail has been pointing at.
 *
 * "Create a review round before assigning submissions" was true and unactionable:
 * every path into assignment, scoring and anonymised reading needs a round, and
 * nothing in the product could make one outside the demo seed.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addReviewRound,
	deleteReviewRound,
	renameReviewRound,
	reviewRounds
} from '$lib/server/conference/review-rounds';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * A round's window, read the way the call for papers reads its own (`cfp/+page.server.ts`).
 *
 * The page converts the picker's local wall time to an ISO instant before submitting,
 * because only the browser knows which zone the organizer typed in. A submit without
 * JavaScript sends bare wall time, and that is read as UTC — stated rather than pretended.
 */
const when = (form: FormData, name: string) => {
	const raw = String(form.get(name) ?? '').trim();
	if (!raw) return null;
	const value = new Date(raw);
	return Number.isNaN(value.getTime()) ? null : value;
};

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	return { rounds: await reviewRounds(conference.id) };
};

export const actions: Actions = {
	add: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const result = await addReviewRound(conference.id, {
			name: String(form.get('name') ?? ''),
			anonymized: form.get('anonymized') === 'on',
			opensAt: when(form, 'opensAt'),
			closesAt: when(form, 'closesAt')
		});

		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Round added. Assign submissions to it from a submission’s page.' };
	},

	rename: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = Number(form.get('id'));

		if (!Number.isInteger(id)) return fail(400, { message: 'Unknown round.' });

		const result = await renameReviewRound(conference.id, id, {
			name: String(form.get('name') ?? ''),
			anonymized: form.get('anonymized') === 'on',
			opensAt: when(form, 'opensAt'),
			closesAt: when(form, 'closesAt')
		});

		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Round saved.' };
	},

	remove: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('id'));

		if (!Number.isInteger(id)) return fail(400, { message: 'Unknown round.' });

		const result = await deleteReviewRound(conference.id, id);
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Round removed.' };
	}
};
