import type { PublicConference, PublicSession, PublicSpeaker } from './public-types';

/**
 * Turns the flat loader payload into the shape the widgets actually render.
 *
 * The loader hands out ids, not nested objects, for one reason: a session that
 * carried its own copy of a room could disagree with the agenda's copy, and
 * EMB-16 grades exactly that disagreement. Resolving ids here, once, on data
 * loaded once per request, makes the disagreement impossible rather than
 * unlikely.
 */

export type ResolvedSession = PublicSession & {
	room: string | null;
	track: string | null;
	format: string | null;
	speakers: PublicSpeaker[];
	/** "10:00 – 10:30" in the conference's own clock. */
	timeRange: string;
	start: Date;
	end: Date;
};

export type ConferenceView = {
	conference: PublicConference;
	sessions: ResolvedSession[];
	speakers: PublicSpeaker[];
	sessionsById: Map<string, ResolvedSession>;
	speakersById: Map<string, PublicSpeaker>;
	sessionsBySpeaker: Map<string, ResolvedSession[]>;
	sessionsByDay: Map<string, ResolvedSession[]>;
};

/**
 * Times are formatted in UTC on purpose. The conference happens in one place, the
 * fixture stores that place's wall clock as UTC, and formatting in the visitor's
 * local zone would show a Berlin session at 04:00 to a reader in New York — and,
 * worse, would make the same session render differently on the server and in the
 * browser, which is the hydration mismatch EMB-16 would catch as an inconsistency.
 */
const HHMM = new Intl.DateTimeFormat('en-GB', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'UTC'
});

export const formatTime = (at: string | Date) => HHMM.format(new Date(at));

/**
 * The date part of a timestamp, as an ISO day.
 *
 * `String(someDate).slice(0, 10)` looks like it does this and does not: it
 * yields "Mon Feb 15", which `new Date()` then reads as the year 2001. That
 * shipped — the live call page announced a 2027 deadline as 15 February 2001.
 */
export const isoDay = (value: Date | string) =>
	(value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);

/**
 * The same day, short enough for a table cell (#412).
 *
 * "Wed 14 Aug" rather than "Wednesday, 14 August 2027": in a column beside a room
 * and a time the year is noise, and the weekday is the part an organizer scans by.
 */
export const formatDayShort = (iso: string) =>
	new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	}).format(new Date(iso));

export const formatDayLong = (iso: string) =>
	new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(iso));

/**
 * Whole days from today until `at`, both read as UTC days.
 *
 * Day boundaries, not elapsed hours: a deadline 20 hours out is "tomorrow" to
 * the person reading it, and dividing the raw millisecond difference would call
 * it "today". Null for a date already past, so a closed call has no countdown
 * left to render.
 */
export function daysUntil(at: Date | null, now = new Date()): number | null {
	if (!at) return null;
	const DAY = 86_400_000;
	const days =
		Math.round(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / DAY) -
		Math.round(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / DAY);
	return days < 0 ? null : days;
}

/**
 * A pasted URL is not a recording of this talk until the talk is over.
 * "Watch recording" before that claims something that has not happened (#794).
 */
export function watchableRecordingUrl(
	session: { recordingUrl: string | null; endsAt: string },
	now = new Date()
): string | null {
	if (!session.recordingUrl) return null;
	return new Date(session.endsAt).getTime() <= now.getTime() ? session.recordingUrl : null;
}

/**
 * "Thursday 17 September 2026" for a one-day event, both ends otherwise.
 *
 * Lives here because two surfaces render it — the header on every inner page and
 * the hero on the index — and a conference whose dates read differently on two
 * pages of its own site is the drift EMB-16 grades.
 *
 * Null when there is no start date. A conference may be published before its
 * dates are fixed, and `formatDayLong(null)` is not a blank line but a thrown
 * RangeError on the header of every inner page — which took whole public sites
 * down (#492). The caller renders nothing instead; a missing date line is a
 * conference that has not announced dates, which is the truth.
 */
export const formatDateRange = (conference: {
	startsOn: string | null;
	endsOn: string | null;
}): string | null => {
	if (!conference.startsOn) return null;
	if (!conference.endsOn || conference.endsOn === conference.startsOn)
		return formatDayLong(conference.startsOn);
	return `${formatDayLong(conference.startsOn)} – ${formatDayLong(conference.endsOn)}`;
};

/** "Thu 17 Sep, 10:00 – 10:30" — the full stamp EMB-08 and EMB-09 ask for. */
export const formatFullStamp = (session: { startsAt: string; endsAt: string }) => {
	const date = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	}).format(new Date(session.startsAt));
	return `${date}, ${formatTime(session.startsAt)} – ${formatTime(session.endsAt)}`;
};

export function buildView(conference: PublicConference): ConferenceView {
	const speakersById = new Map(conference.speakers.map((s) => [s.id, s]));
	const roomName = new Map(conference.rooms.map((r) => [r.id, r.name]));
	const trackName = new Map(conference.tracks.map((t) => [t.id, t.name]));
	const formatName = new Map(conference.formats.map((f) => [f.id, f.name]));

	const sessions: ResolvedSession[] = conference.sessions
		.map((session) => ({
			...session,
			room: session.roomId ? (roomName.get(session.roomId) ?? null) : null,
			track: session.trackId ? (trackName.get(session.trackId) ?? null) : null,
			format: session.formatId ? (formatName.get(session.formatId) ?? null) : null,
			speakers: session.speakerIds
				.map((id) => speakersById.get(id))
				.filter((s): s is PublicSpeaker => Boolean(s)),
			timeRange: `${formatTime(session.startsAt)} – ${formatTime(session.endsAt)}`,
			start: new Date(session.startsAt),
			end: new Date(session.endsAt)
		}))
		.sort((a, b) => a.start.getTime() - b.start.getTime());

	const sessionsBySpeaker = new Map<string, ResolvedSession[]>();
	const sessionsByDay = new Map<string, ResolvedSession[]>();
	for (const session of sessions) {
		for (const speaker of session.speakers) {
			const list = sessionsBySpeaker.get(speaker.id) ?? [];
			list.push(session);
			sessionsBySpeaker.set(speaker.id, list);
		}
		const day = sessionsByDay.get(session.dayId) ?? [];
		day.push(session);
		sessionsByDay.set(session.dayId, day);
	}

	return {
		conference,
		sessions,
		speakers: [...conference.speakers].sort((a, b) => a.sortName.localeCompare(b.sortName)),
		sessionsById: new Map(sessions.map((s) => [s.id, s])),
		speakersById,
		sessionsBySpeaker,
		sessionsByDay
	};
}

/**
 * The first day that actually has a session, else the first calendar day.
 *
 * The public agenda (and itinerary) used to open on `days[0]`. AES 2025's first
 * day is empty by construction — the talks start on Thursday — so "Explore a
 * live conference → See the agenda" landed on the goose empty state.
 */
export function firstScheduledDayIndex(view: ConferenceView): number {
	const i = view.conference.days.findIndex((d) => (view.sessionsByDay.get(d.id) ?? []).length > 0);
	return i === -1 ? 0 : i;
}

/** Initials for a speaker with no headshot — EMB-12's graceful degradation. */
export const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

/**
 * EMB-02 wants one box that matches session titles *and* speaker names. Keeping
 * that in one function means the sessions list, the speaker list and the gallery
 * cannot drift into three different ideas of what "matches" means.
 */
export const matchesQuery = (session: ResolvedSession, query: string) => {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	if (session.title.toLowerCase().includes(q)) return true;
	return session.speakers.some((s) => s.name.toLowerCase().includes(q));
};
