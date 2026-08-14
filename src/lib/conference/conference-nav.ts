/**
 * Destinations on the conference rail (#410).
 *
 * The list is the product map, not a route dump: labels name the work
 * ("Rounds & scorecards", "Reviewer pool") so an organizer — or an eval
 * agent — hunting for a thing finds the word on the door.
 */

export type ConferenceRail = {
	name: string;
	slug: string;
	status: string;
	venue: string | null;
	startsOn: string | Date | null;
	endsOn: string | Date | null;
};

export type ConferenceNavId =
	| 'dashboard'
	| 'submissions'
	| 'cfp'
	| 'agenda'
	| 'speakers'
	| 'content'
	| 'rounds'
	| 'people'
	| 'embed'
	| 'settings';

export type ConferenceNavItem = {
	id: ConferenceNavId;
	href: string;
	label: string;
};

export function conferenceNav(slug: string): ConferenceNavItem[] {
	const base = `/manage/${slug}`;
	return [
		{ id: 'dashboard', href: `${base}/dashboard`, label: 'Dashboard' },
		{ id: 'submissions', href: `${base}/submissions`, label: 'Submissions' },
		{ id: 'cfp', href: `${base}/cfp`, label: 'Call for papers' },
		{ id: 'agenda', href: `${base}/agenda`, label: 'Agenda' },
		{ id: 'speakers', href: `${base}/speakers`, label: 'Speakers' },
		{ id: 'content', href: `${base}/content`, label: 'Speaker content' },
		{ id: 'rounds', href: `${base}/rounds`, label: 'Rounds & scorecards' },
		{ id: 'people', href: `${base}/people`, label: 'Reviewer pool' },
		{ id: 'embed', href: `${base}/embed`, label: 'Embed & share' },
		{ id: 'settings', href: `${base}/settings`, label: 'Settings' }
	];
}

/** True for `/manage/<slug>` and everything under it, but not the list or /manage/new. */
export function isConferencePath(pathname: string): boolean {
	const parts = pathname.split('/').filter(Boolean);
	return parts[0] === 'manage' && parts.length >= 2 && parts[1] !== 'new';
}

export function conferenceDateRange(
	conference: Pick<ConferenceRail, 'startsOn' | 'endsOn' | 'venue'>
): string {
	const parts: string[] = [];
	if (conference.startsOn) {
		const start = new Date(conference.startsOn);
		const end = conference.endsOn ? new Date(conference.endsOn) : null;
		parts.push(
			end
				? `${start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}`
				: start.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
		);
	}
	if (conference.venue) parts.push(conference.venue);
	return parts.join(' · ');
}

export function isConferenceRail(value: unknown): value is ConferenceRail {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return typeof record.name === 'string' && typeof record.slug === 'string';
}
