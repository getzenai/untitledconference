/**
 * The speaker's own profile, and the two boundaries that are invisible in the
 * queries: whose profile a write may touch, and whose headshot may be read by
 * someone who is not signed in at all.
 *
 * Hermetic — each `describe` owns its organization and its users, because
 * profile identity is keyed on `(organization, email)` in the code under test
 * and a shared fixture would let one test decide another's outcome.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	headshotIsPublic,
	myProfiles,
	ownsProfile,
	setOwnHeadshot,
	updateOwnProfile
} from './speaker-profile';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function makeOrg(
	tag: string,
	status: 'draft' | 'published' = 'published'
): Promise<{ organizationId: string; conference: Conference }> {
	const organizationId = `org-prof-${tag}-${stamp}`;
	await db.insert(organization).values({
		id: organizationId,
		name: `Profile Org ${tag}`,
		slug: organizationId,
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: `Profile Conf ${tag}`,
			slug: `conf-prof-${tag}-${stamp}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status
		})
		.returning();

	return { organizationId, conference };
}

async function makeUser(tag: string, name = 'Priya Raman'): Promise<{ id: string; email: string }> {
	const id = `user-prof-${tag}-${stamp}`;
	const email = `${id}@example.test`;
	await db.insert(user).values({ id, email, emailVerified: true, name });
	return { id, email };
}

async function makeProfile(
	organizationId: string,
	userId: string | null,
	email: string | null,
	name = 'Priya Raman',
	headshotUrl: string | null = null
): Promise<number> {
	const [profile] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, userId, name, sortName: 'Raman, Priya', email, headshotUrl })
		.returning({ id: speakerProfileTable.id });
	return profile.id;
}

describe('editing your own profile', () => {
	let organizationId = '';
	let speaker: { id: string; email: string };
	let profileId = 0;

	beforeAll(async () => {
		({ organizationId } = await makeOrg('edit'));
		speaker = await makeUser('edit');
		profileId = await makeProfile(organizationId, speaker.id, speaker.email);
	});

	it('writes the fields a speaker owns about themselves', async () => {
		const saved = await updateOwnProfile(speaker.id, profileId, {
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			jobTitle: 'Staff Engineer',
			company: 'Northwind',
			bio: 'Works on build systems.',
			links: [{ label: 'Site', url: 'https://example.com' }]
		});

		expect(saved).toBe(true);

		const [row] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, profileId));

		expect(row.jobTitle).toBe('Staff Engineer');
		expect(row.company).toBe('Northwind');
		expect(row.bio).toBe('Works on build systems.');
		expect(row.links).toBe('[{"label":"Site","url":"https://example.com"}]');
	});

	it('clears an optional field that was emptied, because this form has no draft state', async () => {
		await updateOwnProfile(speaker.id, profileId, {
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			jobTitle: '',
			company: '',
			bio: '',
			links: []
		});

		const [row] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, profileId));

		// The only way to stop working somewhere is to empty the box and save.
		expect(row.jobTitle).toBeNull();
		expect(row.company).toBeNull();
		expect(row.links).toBeNull();
	});

	it('refuses to blank the name, which is NOT NULL and is the public label', async () => {
		expect(
			await updateOwnProfile(speaker.id, profileId, {
				name: '   ',
				sortName: '',
				jobTitle: '',
				company: '',
				bio: '',
				links: []
			})
		).toBe(false);

		const [row] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, profileId));
		expect(row.name).toBe('Priya Raman');
	});
});

describe('somebody else’s profile', () => {
	let organizationId = '';
	let mine: { id: string; email: string };
	let theirs: { id: string; email: string };
	let theirProfileId = 0;

	beforeAll(async () => {
		({ organizationId } = await makeOrg('other'));
		mine = await makeUser('other-mine');
		theirs = await makeUser('other-theirs', 'Marcus Okafor');
		await makeProfile(organizationId, mine.id, mine.email);
		theirProfileId = await makeProfile(organizationId, theirs.id, theirs.email, 'Marcus Okafor');
	});

	it('cannot be edited by passing its id', async () => {
		// The form posts the profile id, so this is the request an attacker writes
		// by hand: my session, their row.
		const saved = await updateOwnProfile(mine.id, theirProfileId, {
			name: 'Renamed By Someone Else',
			sortName: '',
			jobTitle: 'Impostor',
			company: '',
			bio: '',
			links: []
		});

		expect(saved).toBe(false);

		const [row] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, theirProfileId));
		expect(row.name).toBe('Marcus Okafor');
		expect(row.jobTitle).toBeNull();
	});

	it('cannot have its headshot pointed somewhere else', async () => {
		expect(await setOwnHeadshot(mine.id, theirProfileId, '/speaker-photo/999')).toBe(false);

		const [row] = await db
			.select()
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, theirProfileId));
		expect(row.headshotUrl).toBeNull();
	});

	it('is not mine to write bytes for', async () => {
		// The upload asks this before it puts an object at a key derived from the
		// id — without it, guessing an id overwrites someone else's face.
		expect(await ownsProfile(mine.id, theirProfileId)).toBe(false);
		expect(await ownsProfile(theirs.id, theirProfileId)).toBe(true);
	});
});

describe('myProfiles', () => {
	let organizationId = '';
	let speaker: { id: string; email: string };

	beforeAll(async () => {
		({ organizationId } = await makeOrg('mine'));
		speaker = await makeUser('mine');
		// Created by an organizer who typed this person's address; no account
		// attached, because nobody knew whether they had signed up.
		await makeProfile(organizationId, null, speaker.email);
	});

	it('claims the profile an organizer made for this address', async () => {
		// The co-speaker case: you are named by somebody else, so nothing you do
		// attaches your account until a read like this one does it.
		const profiles = await myProfiles(speaker.id);

		expect(profiles).toHaveLength(1);
		expect(profiles[0].organizationId).toBe(organizationId);
		expect(profiles[0].organizationName).toBe(`Profile Org mine`);
	});

	it('does not hand back a profile belonging to another address', async () => {
		const stranger = await makeUser('mine-stranger', 'Nobody');

		expect(await myProfiles(stranger.id)).toEqual([]);
	});
});

describe('whether a headshot may be served publicly', () => {
	let organizationId = '';
	let conference: Conference;
	let speaker: { id: string; email: string };
	let scheduled = 0;
	let rejected = 0;
	let unpublished = 0;

	beforeAll(async () => {
		({ organizationId, conference } = await makeOrg('photo'));
		speaker = await makeUser('photo');
		scheduled = await makeProfile(
			organizationId,
			speaker.id,
			speaker.email,
			'Priya Raman',
			'/speaker-photo/1?v=1'
		);
		rejected = await makeProfile(
			organizationId,
			null,
			`rejected-${stamp}@example.test`,
			'Turned Down',
			'/speaker-photo/2?v=1'
		);

		const [accepted] = await db
			.insert(submissionTable)
			.values({
				conferenceId: conference.id,
				title: 'A scheduled talk',
				status: 'accepted',
				contentApproval: 'approved'
			})
			.returning({ id: submissionTable.id });

		const [declined] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'A rejected talk', status: 'rejected' })
			.returning({ id: submissionTable.id });

		await db.insert(submissionSpeakerTable).values([
			{ submissionId: accepted.id, speakerProfileId: scheduled, isPrimary: true, position: 0 },
			{ submissionId: declined.id, speakerProfileId: rejected, isPrimary: true, position: 0 }
		]);

		await db.insert(placementTable).values({
			conferenceId: conference.id,
			submissionId: accepted.id,
			status: 'confirmed',
			startsAt: new Date('2027-05-12T09:00:00.000Z'),
			endsAt: new Date('2027-05-12T09:30:00.000Z')
		});

		// The same accepted-confirmed-approved chain, on a conference whose
		// organizer has not pressed publish yet.
		const draftOrg = await makeOrg('photo-draft', 'draft');
		unpublished = await makeProfile(
			draftOrg.organizationId,
			null,
			`draft-${stamp}@example.test`,
			'Not Yet Public',
			'/speaker-photo/3?v=1'
		);
		const [draftAccepted] = await db
			.insert(submissionTable)
			.values({
				conferenceId: draftOrg.conference.id,
				title: 'A talk on a draft conference',
				status: 'accepted',
				contentApproval: 'approved'
			})
			.returning({ id: submissionTable.id });
		await db.insert(submissionSpeakerTable).values({
			submissionId: draftAccepted.id,
			speakerProfileId: unpublished,
			isPrimary: true,
			position: 0
		});
		await db.insert(placementTable).values({
			conferenceId: draftOrg.conference.id,
			submissionId: draftAccepted.id,
			status: 'confirmed',
			startsAt: new Date('2027-05-12T09:00:00.000Z'),
			endsAt: new Date('2027-05-12T09:30:00.000Z')
		});
	});

	it('says yes for a speaker who is on the published programme', async () => {
		expect(await headshotIsPublic(scheduled)).toBe(true);
	});

	it('says no for a speaker whose talk was not accepted', async () => {
		// This is the gate that keeps the one public read of an otherwise private
		// bucket as narrow as the public speaker list itself.
		expect(await headshotIsPublic(rejected)).toBe(false);
	});

	it('says no for a profile that does not exist', async () => {
		expect(await headshotIsPublic(0)).toBe(false);
		expect(await headshotIsPublic(999_999_999)).toBe(false);
	});

	it('says no while the conference is not published, same as the public site itself', async () => {
		expect(await headshotIsPublic(unpublished)).toBe(false);
	});

	it('says no again once the speaker removes their headshot, even though the object stays', async () => {
		// Runs last on purpose: it mutates the `scheduled` profile the yes-case uses.
		expect(await setOwnHeadshot(speaker.id, scheduled, null)).toBe(true);
		expect(await headshotIsPublic(scheduled)).toBe(false);
	});
});
