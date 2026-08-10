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
import { safeFilename, uploadsBucket } from '$lib/server/conference/deliverable-storage';
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
			// `attachment` rather than `inline`: a document rendered in our origin
			// is a scripting surface, and nothing here needs viewing in place.
			//
			// The name is re-sanitised here rather than trusted from the row.
			// `safeFilename` already ran at write time, but a header built from
			// stored data should not depend on every past writer having been
			// careful — a stray CR/LF is a second header.
			'Content-Disposition': `attachment; filename="${safeFilename(file.filename)}"`,
			// Without this, a browser may sniff past the declared type. Paired with
			// `attachment` it is belt and braces; alone, neither is enough.
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
};
