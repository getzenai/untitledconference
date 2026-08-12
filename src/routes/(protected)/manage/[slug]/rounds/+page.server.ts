/**
 * Review rounds — dates (ABS-01) and the scorecard each round carries (ABS-03, ABS-04).
 *
 * "Create a review round before assigning submissions" was true and unactionable:
 * every path into assignment, scoring and anonymised reading needs a round, and
 * nothing in the product could make one outside the demo seed. The criteria block
 * under each round is the same shape of gap: the weighted aggregate and the
 * reviewer form already honour kind/weight; this page is the only place that
 * writes them.
 */
import { criterionInputFromForm } from '$lib/conference/scorecard-criterion';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addReviewRound,
	deleteReviewRound,
	renameReviewRound,
	reviewRounds
} from '$lib/server/conference/review-rounds';
import {
	addScorecardCriterion,
	deleteScorecardCriterion,
	moveScorecardCriterion,
	scorecardCriteria,
	updateScorecardCriterion
} from '$lib/server/conference/scorecard-criteria';
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
	const [rounds, criteria] = await Promise.all([
		reviewRounds(conference.id),
		scorecardCriteria(conference.id)
	]);

	const criteriaByRound: Record<number, typeof criteria> = {};
	for (const criterion of criteria) {
		(criteriaByRound[criterion.reviewRoundId] ??= []).push(criterion);
	}

	return { rounds, criteriaByRound };
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
	},

	addCriterion: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const roundId = Number(form.get('roundId'));
		if (!Number.isInteger(roundId) || roundId <= 0) {
			return fail(400, { message: 'Unknown round.' });
		}

		const result = await addScorecardCriterion(
			conference.id,
			roundId,
			criterionInputFromForm(form)
		);
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Criterion added.' };
	},

	updateCriterion: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Unknown criterion.' });
		}

		const result = await updateScorecardCriterion(conference.id, id, criterionInputFromForm(form));
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Criterion saved.' };
	},

	removeCriterion: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Unknown criterion.' });
		}

		const result = await deleteScorecardCriterion(conference.id, id);
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Criterion removed.' };
	},

	moveCriterion: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const direction = form.get('direction');
		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Unknown criterion.' });
		}
		if (direction !== 'up' && direction !== 'down') {
			return fail(400, { message: 'Unknown direction.' });
		}

		const result = await moveScorecardCriterion(conference.id, id, direction);
		if (!result.ok) return fail(400, { message: result.message });
		return { message: 'Order updated.' };
	}
};
