/**
 * Guards the cross-event half of the public speaker page (#20 stage 2).
 *
 * A `speaker_profile` row is org-global; `conference_speaker` merely attaches it
 * to one event. So the same person genuinely accumulates a history, and the
 * profile page is the only public surface that can show it — the agenda knows
 * about one conference by construction.
 *
 * Everything the query must NOT return is seeded here on purpose: an unapproved
 * talk that has a recording link, a talk at a conference the organizer never
 * published, and a second speaker at the same events. None of those would fail a
 * typecheck, and each one is a leak rather than a cosmetic bug.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSpeakerAppearances } from './public-conference';

const suffix = `spkhist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;

const recordingOf2025 = 'https://example.com/watch/2025-keynote';
const recordingOfWithheld = 'https://example.com/watch/withheld';

let adaId: number;
let otherId: number;
let conf2026Id: number;
let slug2025: string;
let slug2026: string;

async function makeConference(
	year: number,
	status: 'published' | 'draft'
): Promise<{ id: number; slug: string; dayId: number; roomId: number }> {
	const slug = `conf-${year}-${suffix}`;
	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: `Untitled ${year}`,
			slug,
			startsOn: `${year}-05-12`,
			endsOn: `${year}-05-12`,
			status
		})
		.returning();
	const [day] = await db
		.insert(conferenceDayTable)
		.values({ conferenceId: conference.id, date: `${year}-05-12`, position: 0 })
		.returning();
	const [room] = await db
		.insert(roomTable)
		.values({ conferenceId: conference.id, name: `Hall ${year}`, position: 0 })
		.returning();
	return { id: conference.id, slug, dayId: day.id, roomId: room.id };
}

async function makeTalk(options: {
	conferenceId: number;
	dayId: number;
	roomId: number;
	title: string;
	startsAt: string;
	speakerId: number;
	approval?: 'approved' | 'pending';
	recordingUrl?: string | null;
}) {
	const [submission] = await db
		.insert(submissionTable)
		.values({
			conferenceId: options.conferenceId,
			title: options.title,
			abstract: `${options.title} abstract`,
			status: 'accepted',
			contentApproval: options.approval ?? 'approved'
		})
		.returning();

	await db
		.insert(submissionSpeakerTable)
		.values({ submissionId: submission.id, speakerProfileId: options.speakerId, isPrimary: true });

	await db.insert(placementTable).values({
		conferenceId: options.conferenceId,
		kind: 'session',
		status: 'confirmed',
		submissionId: submission.id,
		conferenceDayId: options.dayId,
		startsAt: new Date(options.startsAt),
		endsAt: new Date(options.startsAt),
		roomId: options.roomId,
		recordingUrl: options.recordingUrl ?? null
	});
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Speaker History Org',
		slug: organizationId,
		createdAt: new Date()
	});

	const [ada] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Ada Lovelace', sortName: 'Lovelace, Ada' })
		.returning();
	const [other] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Someone Else', sortName: 'Else, Someone' })
		.returning();
	adaId = ada.id;
	otherId = other.id;

	const conf2025 = await makeConference(2025, 'published');
	const conf2026 = await makeConference(2026, 'published');
	const draft = await makeConference(2027, 'draft');
	conf2026Id = conf2026.id;
	slug2025 = conf2025.slug;
	slug2026 = conf2026.slug;

	// Two talks in 2025, inserted late-first so ordering is proven to come from the
	// query rather than from insertion.
	await makeTalk({
		conferenceId: conf2025.id,
		dayId: conf2025.dayId,
		roomId: conf2025.roomId,
		title: '2025 — afternoon',
		startsAt: '2025-05-12T14:00:00Z',
		speakerId: adaId
	});
	await makeTalk({
		conferenceId: conf2025.id,
		dayId: conf2025.dayId,
		roomId: conf2025.roomId,
		title: '2025 — keynote',
		startsAt: '2025-05-12T09:00:00Z',
		speakerId: adaId,
		recordingUrl: recordingOf2025
	});
	await makeTalk({
		conferenceId: conf2026.id,
		dayId: conf2026.dayId,
		roomId: conf2026.roomId,
		title: '2026 — this year',
		startsAt: '2026-05-12T09:00:00Z',
		speakerId: adaId
	});
	// Recorded, but never content-approved. The link is exactly the field somebody
	// fills in after the fact, without re-approving.
	await makeTalk({
		conferenceId: conf2026.id,
		dayId: conf2026.dayId,
		roomId: conf2026.roomId,
		title: '2026 — withheld',
		startsAt: '2026-05-12T11:00:00Z',
		speakerId: adaId,
		approval: 'pending',
		recordingUrl: recordingOfWithheld
	});
	await makeTalk({
		conferenceId: draft.id,
		dayId: draft.dayId,
		roomId: draft.roomId,
		title: '2027 — unpublished conference',
		startsAt: '2027-05-12T09:00:00Z',
		speakerId: adaId
	});
	await makeTalk({
		conferenceId: conf2025.id,
		dayId: conf2025.dayId,
		roomId: conf2025.roomId,
		title: '2025 — somebody else',
		startsAt: '2025-05-12T16:00:00Z',
		speakerId: otherId
	});
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('loadSpeakerAppearances', () => {
	it('returns every published conference the profile spoke at, newest first', async () => {
		const appearances = await loadSpeakerAppearances(adaId);

		expect(appearances.map((a) => a.conferenceSlug)).toEqual([slug2026, slug2025]);
		expect(appearances[0].conferenceName).toBe('Untitled 2026');
	});

	it('excludes the conference being viewed, so the page never lists a talk twice', async () => {
		const appearances = await loadSpeakerAppearances(adaId, { excludeConferenceId: conf2026Id });

		expect(appearances.map((a) => a.conferenceSlug)).toEqual([slug2025]);
	});

	it('orders a conference own talks by start time and carries room and recording', async () => {
		const [twentyFive] = await loadSpeakerAppearances(adaId, { excludeConferenceId: conf2026Id });

		expect(twentyFive.sessions.map((s) => s.title)).toEqual(['2025 — keynote', '2025 — afternoon']);
		expect(twentyFive.sessions[0].recordingUrl).toBe(recordingOf2025);
		expect(twentyFive.sessions[0].room).toBe('Hall 2025');
		// Never recorded reports null rather than an empty string: the page switches
		// the button on truthiness.
		expect(twentyFive.sessions[1].recordingUrl).toBeNull();
	});

	it('withholds an unapproved talk even though it has a recording link (CNT-12)', async () => {
		const appearances = await loadSpeakerAppearances(adaId);
		const titles = appearances.flatMap((a) => a.sessions.map((s) => s.title));

		expect(titles).not.toContain('2026 — withheld');
		expect(JSON.stringify(appearances)).not.toContain(recordingOfWithheld);
	});

	it('withholds a talk at a conference the organizer never published', async () => {
		const appearances = await loadSpeakerAppearances(adaId);

		expect(appearances.map((a) => a.conferenceName)).not.toContain('Untitled 2027');
	});

	it('does not mix in another speaker at the same conference', async () => {
		const appearances = await loadSpeakerAppearances(adaId);
		const titles = appearances.flatMap((a) => a.sessions.map((s) => s.title));

		expect(titles).not.toContain('2025 — somebody else');
	});

	it('returns nothing for a profile id that does not exist', async () => {
		expect(await loadSpeakerAppearances(-1)).toEqual([]);
	});
});
