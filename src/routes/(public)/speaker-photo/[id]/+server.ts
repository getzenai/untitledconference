/**
 * Serves a speaker's headshot to the public speaker page.
 *
 * This is the one unauthenticated read of the uploads bucket, and the narrowness
 * is the point. The bucket has no public URL precisely so that a slide deck
 * cannot be fetched by anyone who learns its key; nothing here changes that.
 * What this route serves is a single object per profile, at a key only the
 * profile's owner can write, and only while that speaker is actually on a
 * published programme — `headshotIsPublic` asks the same question
 * `public-conference.ts` asks before it shows a name at all.
 *
 * So the id is enumerable and that is fine: walking it reveals exactly the faces
 * already printed on `/c/<slug>/speakers`. A profile with no public session
 * answers 404 whether or not it has an object, which is also what a browser
 * would see for a speaker who never uploaded one.
 */
import { uploadsBucket } from '$lib/server/conference/deliverable-storage';
import { headshotIsPublic, headshotObjectKey } from '$lib/server/conference/speaker-profile';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * What may be sent back inline.
 *
 * The upload action already refuses anything that is not one of these, but this
 * is the header that decides whether a stored byte string is treated as a
 * picture or as markup, and it is built from data. An object whose recorded type
 * drifted — or was written before this rule existed — degrades to a download
 * rather than becoming a scripting surface on our own origin.
 */
const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'No such speaker photo');

	if (!(await headshotIsPublic(id))) error(404, 'No such speaker photo');

	const bucket = uploadsBucket(platform);
	if (!bucket) error(503, 'File storage is not configured on this deployment');

	const object = await bucket.get(headshotObjectKey(id));
	if (!object) error(404, 'No such speaker photo');

	const stored = object.httpMetadata?.contentType ?? '';
	const inline = INLINE_IMAGE_TYPES.has(stored);

	// Same two-ReadableStream mismatch the deliverable route documents: one
	// runtime object, two type packages that each think they own the name.
	const body = object.body as unknown as ReadableStream;

	setHeaders({
		// A published headshot changes rarely, and the URL carries a version token
		// that changes when it does, so a shared cache may hold it.
		'Cache-Control': 'public, max-age=300'
	});

	return new Response(body, {
		headers: {
			'Content-Type': inline ? stored : 'application/octet-stream',
			'Content-Disposition': inline ? 'inline' : 'attachment; filename="headshot"',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
