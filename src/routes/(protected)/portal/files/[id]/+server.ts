/**
 * Serves an uploaded deliverable back to the speaker who owns it.
 *
 * This route is the reason the bucket has no public URL. A deliverable is an
 * unreleased slide deck, a signed release form, someone's headshot — and the
 * question at the door is NOT "is this person signed in". Any account would pass
 * that. `ownDeliverable` answers "is this their task", inside the query, so a
 * stranger's id simply selects nothing.
 *
 * Served as an attachment with the stored content type. Nothing here renders in
 * the browser's origin, so an uploaded file cannot become script on our domain.
 */
import { uploadsBucket } from '$lib/server/conference/deliverable-storage';
import { ownDeliverable } from '$lib/server/conference/deliverables';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) error(401, 'Sign in to download your files');

	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'No such file');

	const file = await ownDeliverable(locals.user.id, id);
	if (!file) error(404, 'No such file');

	const bucket = uploadsBucket(platform);
	if (!bucket) error(503, 'File storage is not configured on this deployment');

	const object = await bucket.get(file.fileUrl);
	// A row whose object is gone is a real inconsistency, not a permission
	// problem — say so rather than pretending the file never existed.
	if (!object) error(410, 'That file is no longer in storage');

	// Same two-ReadableStream mismatch as the upload path: one runtime object,
	// two type packages that each think they own the name.
	const body = object.body as unknown as ReadableStream;

	return new Response(body, {
		headers: {
			'Content-Type': file.contentType ?? 'application/octet-stream',
			// `attachment` rather than `inline`: a PDF or an SVG rendered in our
			// origin is a scripting surface, and nothing here needs to be viewed
			// in place.
			'Content-Disposition': `attachment; filename="${file.filename.replace(/"/g, '')}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
