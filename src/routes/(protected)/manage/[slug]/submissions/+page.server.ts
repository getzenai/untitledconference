import { requireOrganizer } from '$lib/server/conference/access';
import {
	decisionNotificationStatuses,
	notifySubmissionDecisions
} from '$lib/server/conference/decision-notifications';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import {
	listSubmissions,
	submissionFacets,
	submissionTotals
} from '$lib/server/conference/organizer-submissions';
import {
	assignReviewersToSubmissions,
	autoDistributeReviews,
	conferenceAssignmentTargets
} from '$lib/server/conference/review-management';
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

function selectedIds(form: FormData): number[] {
	return form
		.getAll('id')
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0);
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);
	const filters = parseSubmissionFilters(url);
	// An unknown `?sort=` falls back to the default rather than failing: the sort is
	// part of a URL organizers paste to each other, and a broken link should still
	// show the table.
	const sort = parseSort(url.searchParams.get('sort'));

	const [page, facets, counts, assignmentTargets] = await Promise.all([
		listSubmissions(conference.id, filters, parsePage(url), sort),
		submissionFacets(conference.id),
		submissionTotals(conference.id),
		conferenceAssignmentTargets(conference.id)
	]);
	const notificationStatuses = await decisionNotificationStatuses(conference.id, page.rows);

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
		counts,
		notificationStatuses,
		assignmentTargets
	};
};

export const actions: Actions = {
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const decision = form.get('decision');
		const ids = selectedIds(form);

		if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
			return fail(400, { message: 'Unknown decision.' });
		}
		if (ids.length === 0) {
			return fail(400, { message: 'Select at least one submission first.' });
		}

		const result = await decideSubmissions(conference, ids, decision as Decision);
		return { decision, result };
	},

	notify: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const ids = selectedIds(await request.formData());
		if (ids.length === 0) {
			return fail(400, { message: 'Select at least one submission first.' });
		}

		return { notificationResult: await notifySubmissionDecisions(conference, ids) };
	},

	/**
	 * Bulk reviewer assignment on the selection (ABS-06).
	 *
	 * Same selection as decide/notify; round + one or more reviewers come from
	 * the bulk bar. Existing rows stay put; ineligible pairs are skipped with a
	 * count rather than aborting the batch.
	 */
	assign: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const ids = selectedIds(form);
		const roundId = Number(form.get('roundId'));
		const reviewerUserIds = form
			.getAll('reviewerUserId')
			.filter((value): value is string => typeof value === 'string' && value !== '');

		if (ids.length === 0) {
			return fail(400, { message: 'Select at least one submission first.' });
		}
		if (!Number.isInteger(roundId) || roundId <= 0 || reviewerUserIds.length === 0) {
			return fail(400, { message: 'Choose a review round and at least one reviewer.' });
		}

		const assignResult = await assignReviewersToSubmissions(
			conference.id,
			ids,
			roundId,
			reviewerUserIds
		);
		return { assignResult };
	},

	/**
	 * Load-balanced fill: each selected submission up to N reviewers, no reviewer
	 * over the cap. Recusals, speaker conflicts and track allow-lists stay shut.
	 */
	distribute: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();
		const ids = selectedIds(form);
		const roundId = Number(form.get('roundId'));
		const reviewsPerSubmission = Number(form.get('reviewsPerSubmission'));
		const capPerReviewer = Number(form.get('capPerReviewer'));

		if (ids.length === 0) {
			return fail(400, { message: 'Select at least one submission first.' });
		}
		if (!Number.isInteger(roundId) || roundId <= 0) {
			return fail(400, { message: 'Choose a review round.' });
		}
		if (
			!Number.isInteger(reviewsPerSubmission) ||
			reviewsPerSubmission < 1 ||
			!Number.isInteger(capPerReviewer) ||
			capPerReviewer < 1
		) {
			return fail(400, {
				message: 'Set how many reviewers each talk needs, and the cap per reviewer.'
			});
		}

		const assignResult = await autoDistributeReviews(conference.id, ids, roundId, {
			reviewsPerSubmission,
			capPerReviewer
		});
		return { assignResult };
	}
};
