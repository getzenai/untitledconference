import { requireReviewer, reviewerSubmission, saveReview } from '$lib/server/conference/reviewer';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const submissionId = (raw: string) => {
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 ? value : null;
};

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireReviewer(locals.user!.id, params.slug);
	const id = submissionId(params.submissionId);

	const submission = id ? await reviewerSubmission(conference, locals.user!.id, id) : null;
	// Not assigned to me is a 404, not an empty page — the queue and the detail answer
	// the same question about who may read what.
	if (!submission) throw error(404, 'Submission not found');

	return { submission };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const { conference } = await requireReviewer(locals.user!.id, params.slug);
		const id = submissionId(params.submissionId);
		if (!id) return fail(400, { message: 'Unknown submission.' });

		const form = await request.formData();
		const answers: Record<number, string> = {};
		for (const [key, value] of form.entries()) {
			const match = /^criterion-(\d+)$/.exec(key);
			if (match && typeof value === 'string') answers[Number(match[1])] = value;
		}

		const saved = await saveReview(conference, locals.user!.id, id, {
			answers,
			comment: String(form.get('comment') ?? ''),
			submit: form.get('intent') === 'submit'
		});

		if (!saved) return fail(404, { message: 'This submission is not assigned to you.' });

		return {
			message:
				form.get('intent') === 'submit'
					? 'Review submitted. Nobody was emailed — telling people is the organizer’s call.'
					: 'Progress saved. It does not count as a review yet.'
		};
	}
};
