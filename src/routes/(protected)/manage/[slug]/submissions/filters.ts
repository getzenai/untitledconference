import type { SubmissionFilters } from '$lib/server/conference/organizer-submissions';
import { submissionStatus } from '$lib/server/db/conference/cfp-schema';

const STATUSES = new Set<string>(submissionStatus.enumValues);

/**
 * Filters live in the URL, not in component state: a filtered table is a view the
 * organizer sends to a colleague, and the browser's back button is the undo they
 * already know.
 *
 * Read from one place by two routes — the page and the CSV export (ABS-13). If the
 * export parsed the query itself, the day someone adds a filter is the day the file
 * quietly stops matching the screen it was downloaded from.
 */
export function parseSubmissionFilters(url: URL): SubmissionFilters {
	const number = (name: string) => {
		const raw = url.searchParams.get(name);
		const value = raw ? Number(raw) : NaN;
		return Number.isInteger(value) && value > 0 ? value : undefined;
	};

	// Anything else in `?agenda=` is no filter at all rather than an error: this is a
	// URL people paste to each other, and a typo should show the table.
	const agenda = url.searchParams.get('agenda');

	return {
		q: url.searchParams.get('q') ?? undefined,
		status: parseStatus(url),
		trackId: number('track'),
		sessionFormatId: number('format'),
		agenda: agenda === 'scheduled' || agenda === 'unscheduled' ? agenda : undefined,
		// Inverted on purpose (#412): a draft has not been handed in, so the default
		// view leaves it out and this box brings it back. Presence means on, for the
		// same reason as `needsReview` below.
		includeDrafts: url.searchParams.has('includeDrafts'),
		// Present at all means on, whatever the value: this rides in on a checkbox,
		// which sends `needsReview=on` and sends nothing when it is off. Comparing
		// against '1' or 'true' would make the box that ships the filter the one
		// shape that fails to apply it.
		needsReview: url.searchParams.has('needsReview')
	};
}

/**
 * Unknown `?status=` values are dropped, same rule as `?sort=` and `?agenda=`: the
 * filter is part of a URL organizers paste to each other, and a broken link should
 * still show the table (#670). `declined` is the word on the Decline button; the
 * column is `rejected`.
 */
function parseStatus(url: URL): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of url.searchParams.getAll('status')) {
		const key = raw.trim().toLowerCase();
		const value = key === 'declined' ? 'rejected' : key;
		if (!STATUSES.has(value) || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}
