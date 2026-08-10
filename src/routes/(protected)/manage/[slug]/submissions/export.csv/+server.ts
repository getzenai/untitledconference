import { csvFile, csvFilename } from '$lib/conference/csv';
import { formatScore } from '$lib/conference/scoring';
import { requireOrganizer } from '$lib/server/conference/access';
import {
	exportSubmissions,
	type SubmissionRow
} from '$lib/server/conference/organizer-submissions';
import { parseSort } from '$lib/server/conference/submission-sort';
import { error } from '@sveltejs/kit';
import { parseSubmissionFilters } from '../filters';
import type { RequestHandler } from './$types';

/**
 * The results table as a file (ABS-13).
 *
 * A committee argues over a spreadsheet — that is simply how this work is done, and
 * an organizer who cannot get the scores out builds the same table by hand in
 * another tool. The export is deliberately the SAME view: same filters, same order,
 * every matching row rather than the page on screen.
 *
 * INTERNAL (R6): this file carries the sponsor tier and the score, so it is
 * organizer-only for the same reason the screen is. `requireOrganizer` is the whole
 * guard, asked here rather than inherited — a `+server.ts` does not run the layout
 * load, and a route that is only protected because of where it sits in the tree is
 * protected by a coincidence.
 */

const HEADER = [
	'id',
	'title',
	'status',
	'score',
	'reviews submitted',
	'reviews assigned',
	'speakers',
	'track',
	'format',
	'sponsor tier (internal)',
	'content approval',
	'submitted at'
];

function line(row: SubmissionRow) {
	return [
		row.id,
		row.title,
		row.status,
		// The same rounding the table shows, so the two never disagree in front of a
		// committee. `formatScore` renders "nobody has scored this" as an em dash.
		formatScore(row.score),
		row.reviewsSubmitted,
		row.reviewsAssigned,
		row.speakers.map((s) => s.name).join('; '),
		row.track,
		row.sessionFormat,
		row.sponsorTier,
		row.contentApproval,
		// ISO, not a locale format: this column gets sorted and filtered, and a
		// spreadsheet reading "10/08/2026" guesses the order from its own settings.
		row.submittedAt?.toISOString() ?? ''
	];
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const { conference } = await requireOrganizer(locals.user!.id, params.slug);

	const { rows, truncated } = await exportSubmissions(
		conference.id,
		parseSubmissionFilters(url),
		parseSort(url.searchParams.get('sort'))
	);

	// Refusing beats a file that looks complete and is not. Nothing downstream can
	// tell a short spreadsheet from a small conference.
	if (truncated) {
		error(
			413,
			'This conference has more submissions than one export can carry. Narrow the filter and export in parts.'
		);
	}

	const filename = csvFilename(
		conference.slug,
		'submissions',
		new Date().toISOString().slice(0, 10)
	);

	return new Response(csvFile(HEADER, rows.map(line)), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			// `attachment` so a browser never renders it, `no-store` because the file
			// holds internal columns and browser caches outlive sessions.
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
};
