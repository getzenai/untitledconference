import { surfaceUrl } from '$lib/conference/embed';
import { icalFile, type CalendarEvent } from '$lib/conference/ical';
import { publicConference } from '$lib/conference/public-data';
import { buildView } from '$lib/conference/public-view';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The published agenda as a calendar subscription (EMB-11).
 *
 * The five embed surfaces are HTML for somebody looking at a page. A visitor who
 * wants the programme in the calendar they already carry has no way in — and that
 * is the one gap the "Embed & share" page has, rather than the configurator the
 * rubric asks for. iCalendar has a consumer that already exists: every calendar.
 *
 * PUBLIC (EMB-14): this reads `publicConference`, the same loader behind the five
 * public surfaces, and nothing else. That is deliberate and it is the whole access
 * story — the loader selects only confirmed placements of content-approved
 * sessions, and no internal field has a place in its type to travel through. A
 * feed that showed one row more than the page it mirrors would be a leak dressed
 * as a feature, and building it from a second query is how that happens.
 *
 * It does not run the public layout's load, so there is no `?embed=1` here and
 * nothing to inherit: a `+server.ts` answers for itself, the 404 included.
 */
export const GET: RequestHandler = async ({ params, setHeaders, url }) => {
	const conference = await publicConference(params.slug);
	if (!conference) error(404, 'No conference with that address');

	// Where a reader goes for the part a calendar entry cannot hold — the speaker
	// pages, the filters, the rest of the day. The same address for every event
	// because the public site has no per-session page to point at.
	const site = surfaceUrl(url.origin, conference.slug, '');

	// The same resolution the agenda page does — rooms and speakers by id, sessions
	// already in start order — so the feed and the grid cannot disagree about which
	// room a talk is in (EMB-16).
	const view = buildView(conference);

	const events: CalendarEvent[] = view.sessions.map((session) => ({
		// Stable across edits, and deliberately not built from the host: a calendar
		// that has already subscribed matches on UID alone, so a UID carrying the
		// origin would duplicate every talk the day this moves to another domain.
		uid: `${session.id}@untitledconference`,
		start: session.start,
		end: session.end,
		summary: session.title,
		description: describe(
			session.speakers.map((speaker) => speaker.name),
			session.description
		),
		location: session.room,
		url: site
	}));

	// Public and unchanging between deploys of the programme, so a shared cache may
	// hold it; an hour is short enough that a room change reaches a subscriber the
	// same morning. Calendars poll on their own schedule anyway — Google's is hours,
	// not minutes, which is worth knowing before promising anyone live updates.
	setHeaders({
		'content-type': 'text/calendar; charset=utf-8',
		'cache-control': 'public, max-age=3600'
	});

	return new Response(icalFile(`${conference.name} — Agenda`, events, new Date()));
};

/**
 * The speaker line above the abstract.
 *
 * Names first because a calendar entry is read at a glance in a list: "Ada
 * Lovelace, Grace Hopper" answers "is this the one I wanted" faster than the
 * first sentence of the abstract does. Both are already on the public sessions
 * page, so neither is new here.
 */
function describe(speakers: string[], abstract: string): string | null {
	const parts = [speakers.join(', '), abstract].filter(Boolean);
	return parts.length ? parts.join('\n\n') : null;
}
