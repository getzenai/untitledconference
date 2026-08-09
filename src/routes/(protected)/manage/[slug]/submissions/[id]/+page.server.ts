import { normalizeRecordingUrl } from '$lib/conference/recording-url';
import { requireOrganizer } from '$lib/server/conference/access';
import { decideSubmissions, type Decision } from '$lib/server/conference/decisions';
import { submissionDetail } from '$lib/server/conference/organizer-submissions';
import { setRecordingUrl } from '$lib/server/conference/recordings';
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
	},

	/**
	 * #20 stage 1: after the event, the organizer pastes the video link.
	 *
	 * The placement id comes out of the form, so it is checked rather than trusted —
	 * `setRecordingUrl` matches on the conference too, and "no row" answers 404 instead
	 * of reporting a save that did not happen.
	 */
	recording: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);

		const form = await request.formData();
		const placementId = Number(form.get('placementId'));
		if (!Number.isInteger(placementId) || placementId <= 0) {
			return fail(400, { message: 'Unknown session.' });
		}

		const parsed = normalizeRecordingUrl(String(form.get('recordingUrl') ?? ''));
		if (!parsed.ok) return fail(400, { message: parsed.message });

		const saved = await setRecordingUrl(conference.id, placementId, parsed.url);
		if (!saved) throw error(404, 'Session not found');

		return { recording: parsed.url };
	}
};
