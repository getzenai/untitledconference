import {
	recuseReview,
	requireReviewer,
	reviewerSubmission,
	saveReview
} from '$lib/server/conference/reviewer';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const submissionId = (raw: string) => {
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 ? value : null;
};

/**
 * Which round the page is for (#294).
 *
 * Two open rounds tie in the priority rule, so the bare permalink always opened
 * the first one and the second round's form could not be reached. A round that
 * this reviewer does not hold falls back to the priority rule rather than 404 —
 * a stale query string is not a permission problem.
 */
const roundId = (raw: string | null) => {
	if (raw === null) return undefined;
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 ? value : undefined;
};

/** The scorecard's answers, keyed by criterion id: `criterion-<id>` in the body. */
const criterionAnswers = (form: FormData) => {
	const answers: Record<number, string> = {};
	for (const [key, value] of form.entries()) {
		const match = /^criterion-(\d+)$/.exec(key);
		if (match && typeof value === 'string') answers[Number(match[1])] = value;
	}
	return answers;
};

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { conference } = await requireReviewer(locals.user!.id, params.slug);
	const id = submissionId(params.submissionId);

	const submission = id
		? await reviewerSubmission(
				conference,
				locals.user!.id,
				id,
				roundId(url.searchParams.get('round'))
			)
		: null;
	// Not assigned to me is a 404, not an empty page — the queue and the detail answer
	// the same question about who may read what.
	if (!submission) throw error(404, 'Submission not found');

	return { submission };
};

export const actions: Actions = {
	recuse: async ({ locals, params, request }) => {
		const { conference } = await requireReviewer(locals.user!.id, params.slug);
		const id = submissionId(params.submissionId);
		const form = await request.formData();
		const reviewId = Number(form.get('reviewId'));
		if (!id || !Number.isInteger(reviewId) || reviewId <= 0) {
			return fail(400, { message: 'Unknown review.' });
		}
		const recused = await recuseReview(conference.id, locals.user!.id, id, reviewId);
		if (!recused.ok) {
			// Same distinction as `save`: withdrawn is not a permission problem.
			if (recused.reason === 'withdrawn') {
				return fail(409, {
					message: 'The speaker withdrew this talk, so it no longer needs a review.'
				});
			}
			return fail(400, { message: 'Only an outstanding review can be recused.' });
		}
		redirect(303, `/review/${conference.slug}`);
	},

	save: async ({ locals, params, request }) => {
		const { conference } = await requireReviewer(locals.user!.id, params.slug);
		const id = submissionId(params.submissionId);
		if (!id) return fail(400, { message: 'Unknown submission.' });

		const form = await request.formData();

		// The round the form was drawn for travels with the POST. Reading it from the
		// query string instead would lose it the moment the browser re-posted without
		// one, and the answers would land in the other round without a word.
		const round = Number(form.get('roundId'));

		const saved = await saveReview(
			conference,
			locals.user!.id,
			id,
			{
				answers: criterionAnswers(form),
				comment: String(form.get('comment') ?? ''),
				submit: form.get('intent') === 'submit'
			},
			Number.isInteger(round) && round > 0 ? round : undefined
		);

		if (!saved.ok) {
			// Two different failures, two different answers. Calling an empty submit
			// "not assigned to you" would send the reviewer looking for a permission
			// problem they do not have.
			if (saved.reason === 'not_assigned') {
				return fail(404, { message: 'This submission is not assigned to you.' });
			}
			// Withdrawn is neither a permission problem nor a validation one: the talk
			// left while this form was open, and the reviewer needs to know that rather
			// than be told to write more.
			if (saved.reason === 'withdrawn') {
				return fail(409, {
					message: 'The speaker withdrew this talk, so it no longer needs a review.'
				});
			}
			// The round is shut (ABS-01). 409 for the same reason withdrawn is: nothing
			// about this POST was malformed, the world moved while the form was open.
			// Two messages, because "come back later" and "you are too late" ask
			// opposite things of the reader.
			if (saved.reason === 'round_not_open') {
				return fail(409, {
					message: 'This review round has not opened yet, so nothing can be filed in it.'
				});
			}
			if (saved.reason === 'round_closed') {
				return fail(409, {
					message: 'This review round is closed. Reviews can no longer be filed or changed.'
				});
			}
			return fail(400, {
				message:
					'Answer at least one criterion, or write a comment, before submitting — submitting is what reveals the other reviews.'
			});
		}

		return {
			ok: true,
			message:
				form.get('intent') === 'submit'
					? 'Review submitted. Nobody was emailed — telling people is the organizer’s call.'
					: 'Progress saved. It does not count as a review yet.'
		};
	}
};
