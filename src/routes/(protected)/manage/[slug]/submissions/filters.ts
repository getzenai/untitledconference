import type { SubmissionFilters } from '$lib/server/conference/organizer-submissions';

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

	return {
		q: url.searchParams.get('q') ?? undefined,
		status: url.searchParams.getAll('status').filter(Boolean),
		trackId: number('track'),
		sessionFormatId: number('format')
	};
}
