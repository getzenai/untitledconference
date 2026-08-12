/**
 * Shared contact filter URL helpers (client + server safe).
 */
export type ContactFilterFields = {
	q?: string;
	company?: string;
	jobTitle?: string;
	tag?: string;
};

/** Build a contacts URL that applies the given filters. */
export function contactFiltersHref(filters: ContactFilterFields): string {
	const params = new URLSearchParams();
	if (filters.q) params.set('q', filters.q);
	if (filters.company) params.set('company', filters.company);
	if (filters.jobTitle) params.set('jobTitle', filters.jobTitle);
	if (filters.tag) params.set('tag', filters.tag);
	const qs = params.toString();
	return qs ? `/contacts?${qs}` : '/contacts';
}
