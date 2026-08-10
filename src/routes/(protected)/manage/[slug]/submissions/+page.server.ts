import { requireOrganizer } from '$lib/server/conference/access';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import {
	listSubmissions,
	submissionFacets,
	submissionTotals
} from '$lib/server/conference/organizer-submissions';
import { parseSort } from '$lib/server/conference/submission-sort';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseSubmissionFilters } from './filters';

const DECISIONS: Decision[] = ['accepted', 'rejected', 'waitlisted'];

/** The page number lives in the URL for the same reason the filters do. */
function parsePage(url: URL) {
	const value = Number(url.searchParams.get('page'));
	return Number.isInteger(value) && value > 0 ? value : 1;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const filters = parseSubmissionFilters(url);
	// An unknown `?sort=` falls back to the default rather than failing: the sort is
	// part of a URL organizers paste to each other, and a broken link should still
	// show the table.
	const sort = parseSort(url.searchParams.get('sort'));

	const [page, facets, counts] = await Promise.all([
		listSubmissions(conference.id, filters, parsePage(url), sort),
		submissionFacets(conference.id),
		submissionTotals(conference.id)
	]);

	return {
		submissions: page.rows,
		pagination: {
			matching: page.matching,
			page: page.page,
			pageSize: page.pageSize,
			pageCount: page.pageCount
		},
		facets,
		filters,
		sort,
		counts
	};
};

export const actions: Actions = {
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const decision = form.get('decision');
		const ids = form
			.getAll('id')
			.map((v) => Number(v))
			.filter((n) => Number.isInteger(n) && n > 0);

		if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
			return fail(400, { message: 'Unknown decision.' });
		}
		if (ids.length === 0) {
			return fail(400, { message: 'Select at least one submission first.' });
		}

		const result = await decideSubmissions(conference, ids, decision as Decision);
		return { decision, result };
	}
};
