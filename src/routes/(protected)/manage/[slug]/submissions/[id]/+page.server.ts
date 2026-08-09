import { requireOrganizer } from '$lib/server/conference/access';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import { submissionDetail } from '$lib/server/conference/organizer-submissions';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DECISIONS: Decision[] = ['accepted', 'rejected', 'waitlisted'];

function submissionId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Submission not found');
	return id;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const submission = await submissionDetail(conference.id, submissionId(params.id));
	if (!submission) throw error(404, 'Submission not found');

	return { submission };
};

export const actions: Actions = {
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const decision = form.get('decision');
		if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
			return fail(400, { message: 'Unknown decision.' });
		}

		const result = await decideSubmissions(
			conference,
			[submissionId(params.id)],
			decision as Decision
		);
		return { decision, result };
	}
};
