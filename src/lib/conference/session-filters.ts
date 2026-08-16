/**
 * The public session list's filters, as they live in the URL (#751).
 *
 * The list used to hold the search in component state, so a filtered view was
 * not a link: reloading emptied it, and "here are the three platform talks"
 * could not be sent to anyone. That also broke the rule in CLAUDE.md — the same
 * URL showed different content depending on hidden state.
 *
 * Pure and both-side safe, like `contact-filters.ts`, so the arithmetic can be
 * tested without a browser. The page owns *when* the URL changes; this owns
 * what it says.
 */
export type SessionFilters = {
	q: string;
	tracks: string[];
	formats: string[];
	rooms: string[];
};

/** Facet keys, singular in the URL because each one repeats: `?track=a&track=b`. */
type FacetKey = 'track' | 'format' | 'room';

export const EMPTY_SESSION_FILTERS: SessionFilters = { q: '', tracks: [], formats: [], rooms: [] };

/**
 * What the URL currently asks for.
 *
 * A missing parameter and an empty one mean the same thing — no opinion — so
 * `?q=` reads as "no search" rather than "search for nothing".
 */
export function readSessionFilters(params: URLSearchParams): SessionFilters {
	return {
		q: params.get('q')?.trim() ?? '',
		tracks: readFacet(params, 'track'),
		formats: readFacet(params, 'format'),
		rooms: readFacet(params, 'room')
	};
}

function readFacet(params: URLSearchParams, key: FacetKey): string[] {
	return params.getAll(key).filter((value) => value !== '');
}

/**
 * The address for a given set of filters, keeping everything else in the URL —
 * the `#session-filters` hash the "Search and filter" link adds, and any
 * parameter another feature owns (`embed`, say).
 *
 * An empty value deletes its parameter rather than writing an empty one: a
 * cleared search must leave a clean URL, or every visit accumulates `?q=`.
 */
export function sessionFiltersHref(current: URL, filters: SessionFilters): string {
	const next = new URL(current);
	if (filters.q.trim()) next.searchParams.set('q', filters.q.trim());
	else next.searchParams.delete('q');
	writeFacet(next, 'track', filters.tracks);
	writeFacet(next, 'format', filters.formats);
	writeFacet(next, 'room', filters.rooms);
	return `${next.pathname}${next.search}${next.hash}`;
}

function writeFacet(url: URL, key: FacetKey, values: string[]): void {
	url.searchParams.delete(key);
	for (const value of values) {
		if (value !== '') url.searchParams.append(key, value);
	}
}

/** True once the visitor has narrowed the list in any way. */
export function hasSessionFilters(filters: SessionFilters): boolean {
	return (
		filters.q.trim() !== '' ||
		filters.tracks.length > 0 ||
		filters.formats.length > 0 ||
		filters.rooms.length > 0
	);
}

/** A facet value switched on or off, order preserved so the URL is stable. */
export function toggleFacetValue(values: string[], value: string): string[] {
	return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}
