/**
 * One speaker task from the organizer's side: what was handed in, and the decision.
 *
 * Every action scopes by conference, never by the speaker's account. That is the whole
 * reason this screen exists — a speaker profile the organizer created has no `user_id`,
 * so an ownership check would lock the organizer out of files they are responsible for.
 */
import { requireOrganizer } from '$lib/server/conference/access';
import {
	addOrganizerComment,
	conferenceTask,
	conferenceTaskFiles,
	setDeliverableApproval
} from '$lib/server/conference/organizer-content';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function taskId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) error(404, 'No such task');
	return id;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const task = await conferenceTask(conference.id, taskId(params.id));
	if (!task) error(404, 'No such task');

	return { conference, task, files: await conferenceTaskFiles(conference.id, task.id) };
};

const APPROVALS = ['approved', 'rejected', 'pending'] as const;
type Approval = (typeof APPROVALS)[number];

function approval(value: FormDataEntryValue | null): Approval | null {
	const v = String(value ?? '');
	return APPROVALS.includes(v as Approval) ? (v as Approval) : null;
}

export const actions: Actions = {
	decide: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const deliverableId = Number(form.get('deliverableId'));
		const status = approval(form.get('approval'));
		if (!Number.isInteger(deliverableId) || !status) {
			return fail(400, { error: 'Unknown file or decision.' });
		}

		if (!(await setDeliverableApproval(conference.id, deliverableId, status))) {
			error(404, 'No such file');
		}

		// A rejection with no reason leaves the speaker guessing, so the note rides
		// along with the decision rather than being a second thing to remember.
		const note = String(form.get('note') ?? '');
		if (note.trim()) {
			await addOrganizerComment(conference.id, deliverableId, locals.user!.id, note);
		}

		return { decided: status };
	},

	comment: async ({ locals, params, request }) => {
		const { conference } = await requireOrganizer(locals.user!.id, params.slug);
		const form = await request.formData();

		const deliverableId = Number(form.get('deliverableId'));
		const body = String(form.get('body') ?? '');
		if (!Number.isInteger(deliverableId)) return fail(400, { error: 'Unknown file.' });
		if (!body.trim()) return fail(400, { error: 'Write something first.' });

		const created = await addOrganizerComment(conference.id, deliverableId, locals.user!.id, body);
		if (created === null) error(404, 'No such file');

		return { commented: true };
	}
};
