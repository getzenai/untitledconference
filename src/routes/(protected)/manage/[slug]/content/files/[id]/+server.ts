/**
 * Serves a deliverable to the organizer who runs the conference it belongs to.
 *
 * A near-copy of the speaker portal's download route, and deliberately not shared with
 * it: the two answer different questions at the door. The portal asks "is this your
 * task", anchored on `speaker_profile.user_id`. This one asks "is this a file of the
 * conference you organise", after `requireOrganizer` has already established who is
 * asking.
 *
 * Sharing one route behind a role flag would put both answers in one branch, and the
 * branch that is wrong by default is the one that leaks. Both routes inline the
 * same types — PDF and ordinary images — so a preview can render; everything
 * else stays attachment. The type we send is one we chose — an uploaded
 * `text/html` named `slides.pdf` must not execute here.
 *
 * The reason it exists at all: a speaker profile created by an organizer has no
 * account, so its uploads are unreachable through the ownership route — on the demo
 * tenant, Ada Bennett's headshot could be downloaded by nobody at all.
 */
import { inlineContentType } from '$lib/conference/file-preview';
import { requireOrganizer } from '$lib/server/conference/access';
import { safeFilename, uploadsBucket } from '$lib/server/conference/deliverable-storage';
import { conferenceDeliverable } from '$lib/server/conference/organizer-content';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	// `+server.ts` does not run the layout load, so the guard has to be here. A route
	// protected only by its place in the tree is protected by an accident.
	if (!locals.user) error(401, 'Sign in to download conference files');

	const { conference } = await requireOrganizer(locals.user.id, params.slug);

	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'No such file');

	const file = await conferenceDeliverable(conference.id, id);
	if (!file) error(404, 'No such file');

	const bucket = uploadsBucket(platform);
	if (!bucket) error(503, 'File storage is not configured on this deployment');

	const object = await bucket.get(file.fileUrl);
	// A row whose object is gone is a real inconsistency, not a permission problem.
	if (!object) error(410, 'That file is no longer in storage');

	const body = object.body as unknown as ReadableStream;
	const inlineType = inlineContentType(file.filename, file.contentType);

	return new Response(body, {
		headers: {
			'Content-Type': inlineType ?? file.contentType ?? 'application/octet-stream',
			// Re-sanitised here rather than trusted from the row: a header built from
			// stored data should not depend on every past writer having been careful.
			'Content-Disposition': `${inlineType ? 'inline' : 'attachment'}; filename="${safeFilename(file.filename)}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
};
