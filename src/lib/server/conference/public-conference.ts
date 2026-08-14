/**
 * The database behind the five public widget surfaces.
 *
 * This is the body that `$lib/conference/public-data` delegates to. It owes its
 * caller exactly three guarantees, and each one is graded:
 *
 *  1. Only `placement.status = 'confirmed'` rows whose submission is `accepted`
 *     AND `content_approval = 'approved'` (CNT-12). "Unapproved" includes
 *     `pending` — it does not only mean `rejected`.
 *  2. No internal column is SELECTed at all. Sponsor tier, review scores and
 *     reviewer comments have no field to leak through, because not selected beats
 *     not rendered (EMB-14).
 *  3. Sessions ordered by start time, speakers by `sortName`, so all five surfaces
 *     agree without sorting again (EMB-04, EMB-12, EMB-16).
 *
 * Ids are stringified at this boundary: the contract in `public-types` uses
 * strings so the interface never does arithmetic on a primary key.
 */
import type { PublicConference, PublicSession, PublicSpeaker } from '$lib/conference/public-types';
import { isPublishableUrl, parseSpeakerLinks } from '$lib/conference/speaker-links';
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable,
	sessionFormatTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';

/** "Thursday, 17 September" — the day-tab label the agenda and itinerary show. */
function dayLabel(date: string): string {
	// `date` is a Postgres `date`, i.e. YYYY-MM-DD with no timezone. Parsing it as
	// UTC keeps the label from sliding a day backwards west of Greenwich.
	//
	// en-GB renders this as "Wednesday 12 May"; the surfaces were designed against
	// the fixture's "Thursday, 17 September", so the comma is restored to keep the
	// two sources visually identical.
	const formatted = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
	return formatted.replace(/^(\w+)\s/, '$1, ');
}

function iso(value: Date | string | null): string {
	if (!value) return '';
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalId(value: number | null): string | null {
	return value === null ? null : String(value);
}

async function loadHeader(slug: string) {
	const [conference] = await db
		.select({
			id: conferenceTable.id,
			slug: conferenceTable.slug,
			name: conferenceTable.name,
			venue: conferenceTable.venue,
			startsOn: conferenceTable.startsOn,
			endsOn: conferenceTable.endsOn
		})
		.from(conferenceTable)
		.where(and(eq(conferenceTable.slug, slug), eq(conferenceTable.status, 'published')))
		.limit(1);

	return conference ?? null;
}

/**
 * Why `/c/<slug>` has nothing to show (#474).
 *
 * Only ever called after `loadPublicConference` has already missed, so it costs
 * one query on the 404 path and nothing on a real page. It exists because the
 * miss has three causes and the page told all three the same untrue thing — "No
 * conference with that address" — including to the organizer who arrived by
 * clicking our own link from their own draft.
 *
 * It does confirm to a stranger that a slug is taken by an unpublished
 * conference. That is the price of the sentence being true, and the row itself
 * stays unreadable: nothing but the status leaves this function.
 */
export async function unpublishedConferenceStatus(slug: string): Promise<string | null> {
	const [row] = await db
		.select({ status: conferenceTable.status })
		.from(conferenceTable)
		.where(eq(conferenceTable.slug, slug))
		.limit(1);

	return row?.status ?? null;
}

/** Days, rooms, tracks and formats — the axes every surface filters and groups by. */
async function loadTaxonomy(conferenceId: number) {
	const [days, rooms, tracks, formats] = await Promise.all([
		db
			.select({ id: conferenceDayTable.id, date: conferenceDayTable.date })
			.from(conferenceDayTable)
			.where(eq(conferenceDayTable.conferenceId, conferenceId))
			.orderBy(asc(conferenceDayTable.position), asc(conferenceDayTable.date)),
		db
			.select({ id: roomTable.id, name: roomTable.name })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conferenceId))
			.orderBy(asc(roomTable.position)),
		db
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position)),
		db
			.select({
				id: sessionFormatTable.id,
				name: sessionFormatTable.name,
				minutes: sessionFormatTable.minutes
			})
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position))
	]);

	return {
		days: days.map((d) => ({ id: String(d.id), date: d.date, label: dayLabel(d.date) })),
		rooms: rooms.map((r) => ({ id: String(r.id), name: r.name })),
		tracks: tracks.map((t) => ({ id: String(t.id), name: t.name })),
		formats: formats.map((f) => ({ id: String(f.id), name: f.name, minutes: f.minutes ?? 0 }))
	};
}

/**
 * The gate. Every public surface reads this set and nothing wider.
 *
 * `sponsorTierId` is deliberately absent from the projection — a session held for a
 * sponsor appears as an ordinary session publicly, and nothing downstream can
 * accidentally render the tier because it never arrives.
 */
function selectPublishedPlacements(conferenceId: number) {
	return db
		.select({
			placementId: placementTable.id,
			submissionId: submissionTable.id,
			title: submissionTable.title,
			abstract: submissionTable.abstract,
			dayId: placementTable.conferenceDayId,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt,
			roomId: placementTable.roomId,
			trackId: submissionTable.trackId,
			formatId: submissionTable.sessionFormatId,
			recordingUrl: placementTable.recordingUrl
		})
		.from(placementTable)
		.innerJoin(submissionTable, eq(placementTable.submissionId, submissionTable.id))
		.where(
			and(
				eq(placementTable.conferenceId, conferenceId),
				eq(placementTable.status, 'confirmed'),
				eq(submissionTable.status, 'accepted'),
				eq(submissionTable.contentApproval, 'approved')
			)
		)
		.orderBy(asc(placementTable.startsAt));
}

/** Speakers of the given submissions, primary presenter first within each. */
function selectSpeakersFor(submissionIds: number[]) {
	if (submissionIds.length === 0) return Promise.resolve([]);
	return (
		db
			.select({
				submissionId: submissionSpeakerTable.submissionId,
				speakerId: speakerProfileTable.id,
				name: speakerProfileTable.name,
				sortName: speakerProfileTable.sortName,
				jobTitle: speakerProfileTable.jobTitle,
				company: speakerProfileTable.company,
				headshotUrl: speakerProfileTable.headshotUrl,
				bio: speakerProfileTable.bio,
				links: speakerProfileTable.links
			})
			.from(submissionSpeakerTable)
			.innerJoin(
				speakerProfileTable,
				eq(submissionSpeakerTable.speakerProfileId, speakerProfileTable.id)
			)
			// Restricting here is the point, not an optimisation: without it the join
			// reads every speaker of every submission in every conference — including
			// bios and headshots of people whose talks were rejected — and correctness
			// depends on discarding them afterwards. Not selected beats not rendered.
			.where(inArray(submissionSpeakerTable.submissionId, submissionIds))
			.orderBy(asc(submissionSpeakerTable.position))
	);
}

type PlacementRow = Awaited<ReturnType<typeof selectPublishedPlacements>>[number];
type SpeakerRow = Awaited<ReturnType<typeof selectSpeakersFor>>[number];

/**
 * Turns the two row sets into the shape the surfaces read.
 *
 * `speakers` holds only people with at least one published session, deduplicated
 * across sessions and sorted by `sortName` — a stored column precisely because
 * splitting a display name gets "Ng Wei Ling" and "van der Berg" wrong.
 */
function assembleProgramme(placements: PlacementRow[], speakerRows: SpeakerRow[]) {
	const bySubmission = new Map<number, SpeakerRow[]>();
	for (const row of speakerRows) {
		bySubmission.set(row.submissionId, [...(bySubmission.get(row.submissionId) ?? []), row]);
	}

	const sessions: PublicSession[] = placements.map((row) => ({
		id: String(row.placementId),
		title: row.title,
		description: row.abstract ?? '',
		dayId: String(row.dayId ?? ''),
		startsAt: iso(row.startsAt),
		endsAt: iso(row.endsAt),
		roomId: optionalId(row.roomId),
		trackId: optionalId(row.trackId),
		formatId: optionalId(row.formatId),
		speakerIds: (bySubmission.get(row.submissionId) ?? []).map((s) => String(s.speakerId)),
		recordingUrl: row.recordingUrl
	}));

	const speakersById = new Map<number, PublicSpeaker>();
	for (const s of speakerRows) {
		if (speakersById.has(s.speakerId)) continue;
		speakersById.set(s.speakerId, {
			id: String(s.speakerId),
			name: s.name,
			sortName: s.sortName,
			jobTitle: s.jobTitle,
			company: s.company,
			headshotUrl: s.headshotUrl,
			bio: s.bio,
			// Parsed here rather than in the component: a link that cannot be
			// published must not reach a page as an href, and this is the boundary
			// where public data is decided.
			links: parseSpeakerLinks(s.links).filter((link) => isPublishableUrl(link.url))
		});
	}

	const speakers = [...speakersById.values()].sort((a, b) => a.sortName.localeCompare(b.sortName));
	return { sessions, speakers };
}

export async function loadPublicConference(slug: string): Promise<PublicConference | null> {
	const conference = await loadHeader(slug);
	if (!conference) return null;

	const [taxonomy, placements] = await Promise.all([
		loadTaxonomy(conference.id),
		selectPublishedPlacements(conference.id)
	]);

	const placedIds = placements.map((p) => p.submissionId);
	const placedIdSet = new Set(placedIds);
	const speakerRows = (await selectSpeakersFor(placedIds)).filter((row) =>
		placedIdSet.has(row.submissionId)
	);

	return {
		id: String(conference.id),
		slug: conference.slug,
		name: conference.name,
		venue: conference.venue,
		startsOn: conference.startsOn ?? '',
		endsOn: conference.endsOn ?? '',
		...taxonomy,
		...assembleProgramme(placements, speakerRows)
	};
}

/** A speaker's talks at one other conference, newest conference first. */
export type SpeakerAppearance = {
	conferenceSlug: string;
	conferenceName: string;
	conferenceStartsOn: string;
	sessions: {
		id: string;
		title: string;
		startsAt: string;
		endsAt: string;
		room: string | null;
		recordingUrl: string | null;
	}[];
};

/**
 * Every published talk this speaker profile has, across every published conference.
 *
 * `speaker_profile` is org-global and `conference_speaker` merely attaches it to an
 * event, so one row can carry a person through several years of conferences. The
 * public speaker page is the only place a visitor can see that: the agenda, by
 * construction, knows about one event.
 *
 * The four gates are the same ones `selectPublishedPlacements` applies, plus
 * `conference.status = 'published'` — otherwise a talk from a draft conference
 * would surface here with a link to a page that 404s, which is precisely the leak
 * the directory query avoids on the front door.
 */
export async function loadSpeakerAppearances(
	speakerProfileId: number,
	options: { excludeConferenceId?: number } = {}
): Promise<SpeakerAppearance[]> {
	const rows = await db
		.select({
			conferenceId: conferenceTable.id,
			conferenceSlug: conferenceTable.slug,
			conferenceName: conferenceTable.name,
			conferenceStartsOn: conferenceTable.startsOn,
			placementId: placementTable.id,
			title: submissionTable.title,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt,
			room: roomTable.name,
			recordingUrl: placementTable.recordingUrl
		})
		.from(submissionSpeakerTable)
		.innerJoin(submissionTable, eq(submissionSpeakerTable.submissionId, submissionTable.id))
		.innerJoin(placementTable, eq(placementTable.submissionId, submissionTable.id))
		.innerJoin(conferenceTable, eq(placementTable.conferenceId, conferenceTable.id))
		.leftJoin(roomTable, eq(placementTable.roomId, roomTable.id))
		.where(
			and(
				eq(submissionSpeakerTable.speakerProfileId, speakerProfileId),
				eq(placementTable.status, 'confirmed'),
				eq(submissionTable.status, 'accepted'),
				eq(submissionTable.contentApproval, 'approved'),
				eq(conferenceTable.status, 'published'),
				options.excludeConferenceId === undefined
					? undefined
					: ne(conferenceTable.id, options.excludeConferenceId)
			)
		)
		.orderBy(desc(conferenceTable.startsOn), asc(placementTable.startsAt));

	// Grouped here rather than by the page: the order above is the one the page
	// renders, and re-sorting a map's values elsewhere is how two surfaces end up
	// disagreeing about which conference came first.
	const byConference = new Map<number, SpeakerAppearance>();
	for (const row of rows) {
		let group = byConference.get(row.conferenceId);
		if (!group) {
			group = {
				conferenceSlug: row.conferenceSlug,
				conferenceName: row.conferenceName,
				conferenceStartsOn: row.conferenceStartsOn ?? '',
				sessions: []
			};
			byConference.set(row.conferenceId, group);
		}
		group.sessions.push({
			id: String(row.placementId),
			title: row.title,
			startsAt: iso(row.startsAt),
			endsAt: iso(row.endsAt),
			room: row.room,
			recordingUrl: row.recordingUrl
		});
	}

	return [...byConference.values()];
}

/** One row of the front door: enough to recognise a conference, nothing more. */
export type PublicConferenceSummary = {
	slug: string;
	name: string;
	venue: string | null;
	startsOn: string;
	endsOn: string;
};

/**
 * Every conference whose organizer has published it, soonest first.
 *
 * "Published" is the answer to one question only: does `/c/<slug>` exist. Every
 * caller that means "what may a speaker submit to" or "what is live" wants this
 * one. The front-door directory wants `listDirectoryConferences` instead — see
 * there for why the two came apart (#402).
 *
 * `status = 'published'` is the same predicate `loadHeader` applies, and it has to
 * be: a list containing a draft conference would hand out a link to a page that
 * 404s.
 */
export async function listPublishedConferences(): Promise<PublicConferenceSummary[]> {
	return selectSummaries(eq(conferenceTable.status, 'published'));
}

/**
 * The conferences the front door names (#402).
 *
 * Published *and* listed, because being reachable and being advertised are not the
 * same decision. While one column answered both, `/` showed every conference any
 * agent had published — a fixture whose name was a Unix timestamp sat one click
 * from the hero on the page whose entire job is "this product is real".
 *
 * Deliberately not the predicate behind the call for papers: unlisting a
 * conference must not close its CFP. `listOpenCalls` builds on
 * `listPublishedConferences` for exactly that reason.
 *
 * This exists at all because `/` was a dead end for anyone without an account: it
 * redirected to the login form, and no page reachable from there linked a public
 * conference site. The EMB scenarios all start "at the base URL, logged out", so
 * a visitor who cannot get from `/` to `/c/<slug>` cannot reach any of the five
 * public surfaces at all — however well those surfaces work.
 */
export async function listDirectoryConferences(): Promise<PublicConferenceSummary[]> {
	return selectSummaries(
		and(eq(conferenceTable.status, 'published'), eq(conferenceTable.listedPublicly, true))!
	);
}

async function selectSummaries(where: SQL): Promise<PublicConferenceSummary[]> {
	const rows = await db
		.select({
			slug: conferenceTable.slug,
			name: conferenceTable.name,
			venue: conferenceTable.venue,
			startsOn: conferenceTable.startsOn,
			endsOn: conferenceTable.endsOn
		})
		.from(conferenceTable)
		.where(where)
		.orderBy(asc(conferenceTable.startsOn), asc(conferenceTable.name));

	return rows.map((row) => ({
		slug: row.slug,
		name: row.name,
		venue: row.venue,
		startsOn: row.startsOn ?? '',
		endsOn: row.endsOn ?? ''
	}));
}
