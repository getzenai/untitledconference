import {
	recuseReview,
	requireReviewer,
	reviewerSubmission,
	saveReview,
	type SaveReviewResult
} from '$lib/server/conference/reviewer';
import { isFeatureEnabled } from '$lib/server/feature-flags';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One refused save, one sentence and one status code.
 *
 * Kept apart from the action because these are answers to six different
 * questions, and the differences are the point: calling an empty submit "not
 * assigned to you" sends the reviewer hunting for a permission problem they do
 * not have.
 */
function saveFailure(saved: Extract<SaveReviewResult, { ok: false }>) {
	switch (saved.reason) {
		case 'not_assigned':
			return fail(404, { message: 'This talk is not assigned to you.' });
		// Withdrawn is neither a permission problem nor a validation one: the talk
		// left while this form was open, and the reviewer needs to know that rather
		// than be told to write more. 409, because nothing about the POST was
		// malformed — the world moved.
		case 'withdrawn':
			return fail(409, {
				message: 'The speaker withdrew this talk, so it no longer needs a review.'
			});
		// The round is shut (ABS-01). Two messages, because "come back later" and
		// "you are too late" ask opposite things of the reader.
		case 'round_not_open':
			return fail(409, {
				message: 'This review round has not opened yet, so nothing can be reviewed in it.'
			});
		case 'round_closed':
			return fail(409, {
				message: 'This review round is closed. Reviews can no longer be submitted or changed.'
			});
		// A number off its own scale, in a sentence that names the criterion and the
		// scale (#477). Not "before submitting": this refusal happens to a draft too,
		// and telling somebody who pressed Save progress that they failed to submit
		// sends them looking for a button they did not press.
		case 'rating_off_scale':
			return fail(400, { message: saved.message });
		case 'empty_submit':
			return fail(400, {
				message:
					'Answer at least one criterion, or write a comment, before submitting — submitting is what reveals the other reviews.'
			});
	}
}

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
	if (!submission) throw error(404, 'Talk not found');

	return { submission, chatEnabled: isFeatureEnabled('inAppChat') };
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
		// The queue says what just happened, and names the talk if it can (#463).
		// Without this the only evidence of a recusal was a row that had quietly
		// changed shape.
		redirect(303, `/review/${conference.slug}?recused=${encodeURIComponent(recused.title ?? '')}`);
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

		if (!saved.ok) return saveFailure(saved);

		return {
			ok: true,
			message:
				form.get('intent') === 'submit'
					? 'Review submitted. Nobody was emailed — telling people is the organizer’s call.'
					: 'Progress saved. It does not count as a review yet.'
		};
	}
};
