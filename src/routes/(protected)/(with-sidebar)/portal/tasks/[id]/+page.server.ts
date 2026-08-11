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

/** Postgres 23505 on the (task, version) index, wrapped by Drizzle. */
function isVersionCollision(cause: unknown): boolean {
	const driver = (cause as { cause?: { code?: string; constraint_name?: string } })?.cause;
	return driver?.code === '23505' && driver?.constraint_name === 'deliverable_version_unique';
}

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

		// An action task is ticked off, not handed in. The page only draws the upload
		// form for a file request, but a form posted straight at this action never
		// went through the page — and a deliverable hanging off an action task puts
		// two different rules on one `task.status`: its owner's tick and the newest
		// file's approval. Refused here, before the bucket is touched, so a rejected
		// upload leaves nothing behind to clean up.
		if (task.kind !== 'file_request') {
			return fail(400, { uploadError: 'This task is ticked off, not handed in.' });
		}

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

		try {
			const recorded = await recordDeliverable({
				taskId: task.id,
				userId: locals.user.id,
				fileUrl: key,
				filename: safeFilename(file.name),
				contentType: file.type,
				sizeBytes: file.size,
				version
			});

			// The kind was checked above, but not under a lock: `recordDeliverable`
			// re-checks it on the row it holds and refuses. Reaching this leaves the
			// object with no row — the same harmless leftover as a lost 409 above.
			if (recorded === null) {
				return fail(400, { uploadError: 'This task is ticked off, not handed in.' });
			}
		} catch (cause) {
			// `deliverable_version_unique` is the guard against two uploads that
			// read the same `max(version)`. It takes two uploads to one task within
			// the same moment — rare, since it is one speaker's own task — so this
			// answers the collision instead of redesigning around it. What it must
			// not do is surface as a 500 that reads like the file was rejected.
			if (isVersionCollision(cause)) {
				return fail(409, { uploadError: 'Another upload just landed. Try again.' });
			}
			throw cause;
		}

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
