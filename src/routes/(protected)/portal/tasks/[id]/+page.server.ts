/**
 * One task in the speaker portal: what is being asked, what has been handed in,
 * and the conversation about it (SPK-07/08, CNT-03/04/05).
 */
import { REJECTION_MESSAGES, rejectUpload } from '$lib/conference/upload-limits';
import { objectKey, safeFilename, uploadsBucket } from '$lib/server/conference/deliverable-storage';
import {
	addFileComment,
	nextVersion,
	ownTask,
	recordDeliverable,
	setActionTaskDone,
	taskFiles
} from '$lib/server/conference/deliverables';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function taskId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id)) error(404, 'No such task');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Sign in to see your tasks');

	// One 404 for "no such task" and "not yours" alike — a 403 would confirm the
	// task exists.
	const task = await ownTask(locals.user.id, taskId(params.id));
	if (!task) error(404, 'No such task');

	return { task, files: await taskFiles(task.id) };
};

export const actions: Actions = {
	/**
	 * Stores the bytes, then records the row.
	 *
	 * That order on purpose: a row pointing at an object that was never written
	 * is a broken download with no way to tell from the outside. An object with
	 * no row is invisible and costs a few kilobytes.
	 */
	upload: async ({ request, params, locals, platform }) => {
		if (!locals.user) error(401, 'Sign in to upload');

		const task = await ownTask(locals.user.id, taskId(params.id));
		if (!task) error(404, 'No such task');

		const bucket = uploadsBucket(platform);
		if (!bucket) return fail(503, { uploadError: REJECTION_MESSAGES.no_storage });

		const data = await request.formData();
		const file = data.get('file');
		if (!(file instanceof File)) return fail(400, { uploadError: 'Choose a file first.' });

		const rejection = rejectUpload(file);
		if (rejection) return fail(400, { uploadError: REJECTION_MESSAGES[rejection] });

		const version = await nextVersion(task.id);
		const key = objectKey(task.conferenceId, task.id, version, file.name);

		// `arrayBuffer()` rather than `stream()`: the two ReadableStream types in
		// play here (DOM lib and @cloudflare/workers-types) are the same object at
		// runtime and structurally incompatible at compile time. A buffer sidesteps
		// the mismatch honestly, and 20 MB is well inside a Worker's memory.
		await bucket.put(key, await file.arrayBuffer(), {
			httpMetadata: { contentType: file.type }
		});

		await recordDeliverable({
			taskId: task.id,
			userId: locals.user.id,
			fileUrl: key,
			filename: safeFilename(file.name),
			contentType: file.type,
			sizeBytes: file.size,
			version
		});

		return { uploaded: true, version };
	},

	comment: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Sign in to comment');

		const data = await request.formData();
		const deliverableId = Number(data.get('deliverableId'));
		const body = String(data.get('body') ?? '');

		if (!Number.isInteger(deliverableId)) return fail(400, { commentError: 'Unknown file.' });
		if (!body.trim()) return fail(400, { commentError: 'Write something first.' });

		// `addFileComment` re-checks ownership in its own query; a null answer
		// covers both "no such file" and "not yours".
		const created = await addFileComment(locals.user.id, deliverableId, body);
		if (created === null) error(404, 'No such file');

		return { commented: true };
	},

	toggle: async ({ request, params, locals }) => {
		if (!locals.user) error(401, 'Sign in to update your tasks');

		const data = await request.formData();
		const done = data.get('done') === 'true';

		const changed = await setActionTaskDone(locals.user.id, taskId(params.id), done);
		if (!changed) error(404, 'No such task');

		return { toggled: true };
	}
};
