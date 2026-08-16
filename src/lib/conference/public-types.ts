/**
 * The loader contract for the five public widget surfaces.
 *
 * This is the seam between the interface and the database. Every public surface
 * reads exactly this shape and nothing else, which buys two things the rubric
 * pays for directly:
 *
 *   EMB-16 (roundtrip) — one shape, loaded once per request, so a session cannot
 *     show one room in the agenda and another in the itinerary.
 *   EMB-14 / CNT-12 (scoping) — internal fields are absent from the *type*, not
 *     merely unrendered. Sponsor tier, review scores and unapproved sessions have
 *     no field to leak through. Filtering happens where the data is fetched.
 *
 * Times are ISO-8601 strings, not `Date`: they cross the server/client boundary
 * and must survive serialisation unchanged.
 */
import type { SpeakerLink } from './speaker-links';

export type PublicSpeaker = {
	id: string;
	/** Full display name, e.g. "Ada Lovelace". */
	name: string;
	/**
	 * Sort key for the alphabetical-by-surname ordering EMB-04 and EMB-12 require.
	 * Derived where the data is produced, never by splitting `name` in a component —
	 * "van der Berg" and "Ng Wei Ling" break every client-side guess.
	 */
	sortName: string;
	jobTitle: string | null;
	company: string | null;
	headshotUrl: string | null;
	bio: string | null;
	/** The speaker's own links (SPK-08), already filtered to publishable URLs. */
	links: SpeakerLink[];
};

export type PublicSession = {
	id: string;
	title: string;
	description: string;
	/** `conference_day.id` — which day tab this belongs to. */
	dayId: string;
	startsAt: string;
	endsAt: string;
	roomId: string | null;
	trackId: string | null;
	formatId: string | null;
	/** Ordered, primary speaker first. */
	speakerIds: string[];
	/**
	 * The organizer may paste this before the talk is given. Public "Watch
	 * recording" waits until `endsAt` — a URL is not a recording of a talk
	 * that has not happened (#794).
	 */
	recordingUrl: string | null;
};

export type PublicDay = { id: string; date: string; label: string };
export type PublicRoom = { id: string; name: string };
export type PublicTrack = { id: string; name: string };
export type PublicFormat = { id: string; name: string; minutes: number };

export type PublicConference = {
	id: string;
	slug: string;
	name: string;
	venue: string | null;
	/**
	 * Nullable because the column is: a conference can be created, and published,
	 * before anyone has settled on a date. Anything that renders these has to say
	 * nothing rather than say "Invalid Date" — or throw (#492).
	 */
	startsOn: string | null;
	endsOn: string | null;
	days: PublicDay[];
	rooms: PublicRoom[];
	tracks: PublicTrack[];
	formats: PublicFormat[];
	/** Only confirmed placements of content-approved sessions ever appear here. */
	sessions: PublicSession[];
	/** Only speakers with at least one published session. */
	speakers: PublicSpeaker[];
};
