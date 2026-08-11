/**
 * A selection of files as one ZIP (CNT-14).
 *
 * The alternative this replaces is not "a slower download" — it is an organizer
 * clicking through forty speakers to collect the decks a week before the event,
 * which is when they have the least time. Multi-select and one file out is the
 * whole feature.
 *
 * POST rather than GET, because the selection is a list of checkboxes and a
 * hundred of them do not fit in a URL that every proxy will carry. It also keeps
 * the thing out of browser history, which for a page of unreleased slide decks is
 * the right side of an accident.
 *
 * `requireOrganizer` is asked here rather than inherited: a `+server.ts` does not
 * run the layout load, and a route that is only protected by where it sits in the
 * tree is protected by a coincidence. The signed-out case is answered here for the
 * same reason.
 */
import { attachmentFilename } from '$lib/conference/csv';
import { requireOrganizer } from '$lib/server/conference/access';
import { safeFilename, uploadsBucket } from '$lib/server/conference/deliverable-storage';
import { conferenceFilesToPack, type FileToPack } from '$lib/server/conference/organizer-content';
import { zipPath, zipStore, type ZipEntry } from '$lib/server/conference/zip';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * What one archive may hold.
 *
 * Both limits exist because nothing here streams: the whole ZIP is assembled in a
 * worker's memory, and a worker that runs out returns nothing at all — which an
 * organizer cannot tell apart from the feature being broken. Refusing a selection
 * that is too big, and saying so with its size, is the version of that failure
 * somebody can act on.
 */
const MAX_ZIP_FILES = 100;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;

/** The ids a form actually sent, as numbers, without the ones that were not. */
function selectedIds(form: FormData): number[] {
	const ids = form
		.getAll('id')
		.map((value) => Number(value))
		.filter((id) => Number.isInteger(id) && id > 0);

	return [...new Set(ids)];
}

/**
 * The bytes for each row, named for the archive.
 *
 * A row whose object is gone is a real inconsistency, not a permission problem. It
 * must not take the whole download with it — the other thirty-nine decks are still
 * what the organizer came for — and it must not vanish silently either, so the
 * count comes back and leaves in a header.
 */
async function fetchEntries(
	bucket: NonNullable<ReturnType<typeof uploadsBucket>>,
	files: FileToPack[],
	bySpeaker: boolean
): Promise<{ entries: ZipEntry[]; missing: string[] }> {
	const entries: ZipEntry[] = [];
	const missing: string[] = [];

	for (const file of files) {
		const object = await bucket.get(file.fileUrl);
		if (!object) {
			missing.push(file.filename);
			continue;
		}

		const name = safeFilename(file.filename);
		entries.push({
			name: bySpeaker ? zipPath(file.speakerName, name) : zipPath(name),
			data: new Uint8Array(await object.arrayBuffer()),
			modifiedAt: file.uploadedAt
		});
	}

	return { entries, missing };
}

export const POST: RequestHandler = async ({ locals, params, request, platform, url }) => {
	if (!locals.user) {
		redirect(303, `/login?returnTo=${encodeURIComponent(url.pathname)}`);
	}

	const { conference } = await requireOrganizer(locals.user.id, params.slug);

	const form = await request.formData();
	const ids = selectedIds(form);
	// One folder per speaker by default. A flat archive is the right answer when the
	// selection is already one person's, and the wrong one the moment it is not:
	// three files called `slides.pdf` in a folder called nothing.
	const bySpeaker = String(form.get('group') ?? 'speaker') !== 'flat';

	if (ids.length === 0) error(400, 'Choose at least one file to download.');
	if (ids.length > MAX_ZIP_FILES) {
		error(413, `That is ${ids.length} files; one download takes at most ${MAX_ZIP_FILES}.`);
	}

	const files = await conferenceFilesToPack(conference.id, ids);
	// Fewer rows than ids means some belonged to another conference, or to nothing.
	// Saying so beats handing back a short archive that looks complete.
	if (files.length === 0) error(404, 'None of those files belong to this conference.');

	const claimed = files.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0);
	if (claimed > MAX_ZIP_BYTES) {
		error(
			413,
			`That selection is ${Math.round(claimed / 1024 / 1024)} MB; one download takes at most ${MAX_ZIP_BYTES / 1024 / 1024} MB. Select fewer files.`
		);
	}

	const bucket = uploadsBucket(platform);
	if (!bucket) error(503, 'File storage is not configured on this deployment');

	const { entries, missing } = await fetchEntries(bucket, files, bySpeaker);
	if (entries.length === 0) error(410, 'Those files are no longer in storage.');

	const zip = zipStore(entries);
	// Same builder the CSV exports use: same hazard, which is a slug that is
	// user-supplied in principle and a carriage return that would be a second header.
	const filename = attachmentFilename(
		'zip',
		conference.slug,
		'files',
		new Date().toISOString().slice(0, 10)
	);

	// The buffer rather than the view: a `Uint8Array` is not a `BodyInit` in the
	// Workers types. `zipStore` allocates its output at exactly the right length, so
	// the two are the same bytes and no slice is needed to say so.
	return new Response(zip.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Length': String(zip.length),
			'X-Content-Type-Options': 'nosniff',
			// Unreleased slide decks; browser caches outlive sessions.
			'Cache-Control': 'private, no-store',
			...(missing.length > 0 ? { 'X-Files-Missing': String(missing.length) } : {})
		}
	});
};
