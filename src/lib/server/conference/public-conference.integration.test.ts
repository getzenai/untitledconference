/**
 * Guards the contract the five public surfaces are built on.
 *
 * These are not incidental assertions. Each one corresponds to a criterion that is
 * lost silently if the query drifts: a withheld talk reappearing (CNT-12), an
 * internal column arriving in the payload (EMB-14), or the order differing between
 * surfaces (EMB-04, EMB-12, EMB-16). None of those would fail a typecheck.
 *
 * The fixture is hermetic rather than leaning on the demo seed, so the test states
 * its own preconditions and cannot pass for the wrong reason after a seed change.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	conferenceTable,
	roomTable,
	sessionFormatTable,
	speakerProfileTable,
	sponsorTierTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadPublicConference } from './public-conference';

const suffix = `pubconf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const slug = `conf-${suffix}`;

const withheldTitle = 'Withheld — approval pending';
const publishedTitle = 'Published — approved';

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Public Query Org',
		slug: organizationId,
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Public Query Conf',
			slug,
			venue: 'Somewhere',
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	const conferenceId = conference.id;

	const [day] = await db
		.insert(conferenceDayTable)
		.values({ conferenceId, date: '2027-05-12', position: 0 })
		.returning();
	const [room] = await db
		.insert(roomTable)
		.values({ conferenceId, name: 'Main Stage', position: 0 })
		.returning();
	const [track] = await db
		.insert(trackTable)
		.values({ conferenceId, name: 'AI Engineering', position: 0 })
		.returning();
	const [format] = await db
		.insert(sessionFormatTable)
		.values({ conferenceId, name: 'Talk', minutes: 30, position: 0 })
		.returning();
	// Internal axis. If this ever reaches the payload, EMB-14 is gone.
	const [tier] = await db
		.insert(sponsorTierTable)
		.values({ conferenceId, name: 'Gold', position: 0 })
		.returning();

	// Deliberately inserted in the order that would sort WRONGLY by first name,
	// so a regression to name-splitting shows up as a failure here.
	const [zoe] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: 'Zoe Adler',
			sortName: 'Adler, Zoe',
			jobTitle: 'Engineer',
			company: 'Acme'
		})
		.returning();
	const [wei] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Ng Wei Ling', sortName: 'Ng, Wei Ling' })
		.returning();
	const [unused] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Never Placed', sortName: 'Aaaa, Never' })
		.returning();

	async function makeSubmission(
		title: string,
		approval: 'approved' | 'pending',
		place: boolean,
		startsAt: string,
		speakerIds: number[]
	) {
		const [submission] = await db
			.insert(submissionTable)
			.values({
				conferenceId,
				title,
				abstract: `${title} abstract`,
				trackId: track.id,
				sessionFormatId: format.id,
				sponsorTierId: tier.id,
				status: 'accepted',
				contentApproval: approval
			})
			.returning();

		for (const [i, speakerProfileId] of speakerIds.entries()) {
			await db
				.insert(submissionSpeakerTable)
				.values({ submissionId: submission.id, speakerProfileId, isPrimary: i === 0, position: i });
		}

		if (place) {
			await db.insert(placementTable).values({
				conferenceId,
				kind: 'session',
				status: 'confirmed',
				submissionId: submission.id,
				conferenceDayId: day.id,
				startsAt: new Date(startsAt),
				endsAt: new Date(startsAt),
				roomId: room.id
			});
		}
		return submission;
	}

	// Later start time, inserted first — proves ordering is done by the query.
	await makeSubmission(publishedTitle, 'approved', true, '2027-05-12T14:00:00Z', [wei.id, zoe.id]);
	await makeSubmission(withheldTitle, 'pending', true, '2027-05-12T09:00:00Z', [unused.id]);
	await makeSubmission('Accepted but never scheduled', 'approved', false, '2027-05-12T10:00:00Z', [
		unused.id
	]);
	await makeSubmission('Earliest published', 'approved', true, '2027-05-12T08:00:00Z', [zoe.id]);
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
});

describe('loadPublicConference', () => {
	it('returns null for an unknown slug', async () => {
		expect(await loadPublicConference(`${slug}-does-not-exist`)).toBeNull();
	});

	it('withholds a session whose content_approval is pending (CNT-12)', async () => {
		const conference = await loadPublicConference(slug);
		const titles = conference!.sessions.map((s) => s.title);

		expect(titles).toContain(publishedTitle);
		// "Unapproved" includes `pending`, not only `rejected`.
		expect(titles).not.toContain(withheldTitle);
	});

	it('omits accepted submissions that have no confirmed placement', async () => {
		const conference = await loadPublicConference(slug);
		expect(conference!.sessions.map((s) => s.title)).not.toContain('Accepted but never scheduled');
	});

	it('orders sessions by start time regardless of insertion order', async () => {
		const conference = await loadPublicConference(slug);
		const starts = conference!.sessions.map((s) => s.startsAt);
		expect(starts).toEqual([...starts].sort());
		expect(conference!.sessions[0].title).toBe('Earliest published');
	});

	it('selects no internal column — the payload has exactly the contract keys', async () => {
		const conference = await loadPublicConference(slug);
		const session = conference!.sessions[0];

		expect(Object.keys(session).sort()).toEqual(
			[
				'dayId',
				'description',
				'endsAt',
				'formatId',
				'id',
				'roomId',
				'speakerIds',
				'startsAt',
				'title',
				'trackId'
			].sort()
		);
		// The sponsor tier is set on every seeded submission above; it must not appear.
		expect(JSON.stringify(conference)).not.toContain('sponsorTier');
		expect(JSON.stringify(conference)).not.toContain('Gold');
	});

	it('lists only speakers with a published session, sorted by sortName', async () => {
		const conference = await loadPublicConference(slug);
		const sortNames = conference!.speakers.map((s) => s.sortName);

		// "Aaaa, Never" would sort first if presence were not filtered by placement.
		expect(sortNames).not.toContain('Aaaa, Never');
		expect(sortNames).toEqual(['Adler, Zoe', 'Ng, Wei Ling']);
	});

	it('puts the primary speaker first on a session', async () => {
		const conference = await loadPublicConference(slug);
		const session = conference!.sessions.find((s) => s.title === publishedTitle)!;
		const speakers = session.speakerIds.map(
			(id) => conference!.speakers.find((s) => s.id === id)!.name
		);
		expect(speakers[0]).toBe('Ng Wei Ling');
	});
});
