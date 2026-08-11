/**
 * What the speaker portal shows its owner (CNT-02).
 *
 * Two questions this file exists to answer, neither visible by reading the
 * queries: whether the list is stable across identical reads, and whether a
 * proposal the speaker is genuinely on can be missing from it.
 *
 * Hermetic — the fixture states its own preconditions rather than leaning on the
 * demo seed, and each `describe` owns its organization so profile identity in one
 * cannot decide the outcome of another.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	submissionSpeakerTable,
	submissionTable
} from '$lib/server/db/conference/cfp-schema';
import {
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveSubmission, type SubmissionInput } from './cfp-submission';
import { mySubmission, mySubmissions, myTasks } from './speaker-portal';
import { addSpeakerToConference } from './speakers';

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** One organization, one published conference with an open call. */
async function makeOrg(tag: string): Promise<{ organizationId: string; conference: Conference }> {
	const organizationId = `org-${tag}-${stamp}`;
	await db.insert(organization).values({
		id: organizationId,
		name: `Portal Org ${tag}`,
		slug: organizationId,
		createdAt: new Date()
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: `Portal Conf ${tag}`,
			slug: `conf-${tag}-${stamp}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	await db
		.insert(cfpFormTable)
		.values({ conferenceId: conference.id, title: 'Proposals', status: 'published' });

	return { organizationId, conference };
}

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
	const id = `user-${tag}-${stamp}`;
	const email = `${id}@example.test`;
	await db.insert(user).values({ id, email, emailVerified: true, name: 'Priya Raman' });
	return { id, email };
}

/**
 * A proposal with this profile on it. `updatedAt` is explicit so a test can create
 * the tie production has: rows written in one pass share a timestamp.
 */
async function proposalFor(
	conferenceId: number,
	profileId: number,
	title: string,
	updatedAt: Date
): Promise<number> {
	const [submission] = await db
		.insert(submissionTable)
		.values({
			conferenceId,
			title,
			status: 'submitted',
			submittedAt: updatedAt,
			updatedAt
		})
		.returning({ id: submissionTable.id });

	await db.insert(submissionSpeakerTable).values({
		submissionId: submission.id,
		speakerProfileId: profileId,
		isPrimary: true,
		position: 0
	});

	return submission.id;
}

describe('mySubmissions ordering', () => {
	let organizationId = '';
	let conference: Conference;
	let speaker: { id: string; email: string };

	beforeAll(async () => {
		({ organizationId, conference } = await makeOrg('order'));
		speaker = await makeUser('order');

		const [profile] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId,
				userId: speaker.id,
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		const tied = new Date('2027-01-04T09:00:00.000Z');
		for (const title of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']) {
			await proposalFor(conference.id, profile.id, title, tied);
		}
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, organizationId));
		await db.delete(user).where(eq(user.id, speaker.id));
	});

	it('returns every proposal on every read', async () => {
		for (let i = 0; i < 5; i++) {
			expect(await mySubmissions(speaker.id)).toHaveLength(6);
		}
	});

	it('returns the same order every time when proposals share an updatedAt', async () => {
		// Postgres may return tied rows in any order, so a sort whose only key is
		// `updatedAt` is free to reshuffle between two identical reads.
		const first = (await mySubmissions(speaker.id)).map((s) => s.title);
		for (let i = 0; i < 4; i++) {
			expect((await mySubmissions(speaker.id)).map((s) => s.title)).toEqual(first);
		}
	});
});

describe('mySubmissions visibility for an invited speaker', () => {
	let organizationId = '';
	let conference: Conference;
	let speaker: { id: string; email: string };
	let invitedTalkId = 0;
	let rosterProfileId = 0;

	beforeAll(async () => {
		({ organizationId, conference } = await makeOrg('invite'));
		speaker = await makeUser('invite');

		// The organizer invites her by email before she has an account. This is the
		// documented roster path and it leaves `userId` null.
		const added = await addSpeakerToConference(conference, {
			name: 'Priya Raman',
			email: speaker.email
		});
		if (!added.ok) throw new Error('fixture: addSpeakerToConference failed');
		rosterProfileId = added.speakerProfileId;

		invitedTalkId = await proposalFor(
			conference.id,
			rosterProfileId,
			'Invited talk',
			new Date('2027-03-01T09:00:00.000Z')
		);

		// She then signs up and submits a proposal of her own through the call.
		const input: SubmissionInput = {
			title: 'Her own talk',
			abstract: 'About the thing.',
			keyTakeaway: 'The thing works.',
			audienceLevel: 'intermediate',
			sessionFormatId: null,
			trackId: null,
			answers: {},
			speaker: {
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: speaker.email,
				jobTitle: '',
				company: '',
				bio: ''
			},
			coSpeakers: []
		};
		const saved = await saveSubmission(speaker.id, conference.slug, input, { submit: true });
		if (!saved.ok) throw new Error(`fixture: saveSubmission failed (${saved.reason})`);
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, organizationId));
		await db.delete(user).where(eq(user.id, speaker.id));
	});

	it('does not fork a second profile for a speaker the organizer already invited', async () => {
		const profiles = await db
			.select({ id: speakerProfileTable.id, userId: speakerProfileTable.userId })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.organizationId, organizationId));

		expect(profiles).toHaveLength(1);
		expect(profiles[0].id).toBe(rosterProfileId);
		expect(profiles[0].userId).toBe(speaker.id);
	});

	it('shows both the invited talk and her own proposal', async () => {
		const titles = (await mySubmissions(speaker.id)).map((s) => s.title);
		expect(titles).toContain('Her own talk');
		expect(titles).toContain('Invited talk');
	});

	it('opens the invited talk by direct id', async () => {
		expect(await mySubmission(speaker.id, invitedTalkId)).not.toBeNull();
	});
});

describe('mySubmissions and myTasks for a co-speaker', () => {
	let organizationId = '';
	let conference: Conference;
	/** The person who fills in the form. */
	let submitter: { id: string; email: string };
	/** Named on that form by someone else, and never submits anything themselves. */
	let coSpeaker: { id: string; email: string };
	let talkId = 0;
	let taskId = 0;

	beforeAll(async () => {
		({ organizationId, conference } = await makeOrg('cospeaker'));
		submitter = await makeUser('cospeaker-primary');
		coSpeaker = await makeUser('cospeaker-second');

		const input: SubmissionInput = {
			title: 'The two-person talk',
			abstract: 'Both of us are on it.',
			keyTakeaway: 'Pairing works.',
			audienceLevel: 'intermediate',
			sessionFormatId: null,
			trackId: null,
			answers: {},
			speaker: {
				name: 'Marcus Okafor',
				sortName: 'Okafor, Marcus',
				email: submitter.email,
				jobTitle: '',
				company: '',
				bio: ''
			},
			coSpeakers: [{ name: 'Priya Raman', email: coSpeaker.email, roleLabel: 'Co-presenter' }]
		};
		const saved = await saveSubmission(submitter.id, conference.slug, input, { submit: true });
		if (!saved.ok) throw new Error(`fixture: saveSubmission failed (${saved.reason})`);
		talkId = saved.submissionId;

		// The co-speaker's profile is created by `upsertCoSpeaker` with no account
		// attached. A task written against it is what an acceptance produces.
		const [profile] = await db
			.select({ id: speakerProfileTable.id })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.email, coSpeaker.email));
		if (!profile) throw new Error('fixture: no co-speaker profile');

		const [task] = await db
			.insert(taskTable)
			.values({
				conferenceId: conference.id,
				speakerProfileId: profile.id,
				submissionId: talkId,
				title: 'Send us your slides'
			})
			.returning({ id: taskTable.id });
		taskId = task.id;
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, organizationId));
		await db.delete(user).where(eq(user.id, submitter.id));
		await db.delete(user).where(eq(user.id, coSpeaker.id));
	});

	it('shows the co-presented talk to the co-speaker', async () => {
		const titles = (await mySubmissions(coSpeaker.id)).map((s) => s.title);
		expect(titles).toContain('The two-person talk');
	});

	it('opens the co-presented talk by direct id', async () => {
		expect(await mySubmission(coSpeaker.id, talkId)).not.toBeNull();
	});

	it('shows the co-speaker the task written for them', async () => {
		const ids = (await myTasks(coSpeaker.id)).map((t) => t.id);
		expect(ids).toContain(taskId);
	});

	it('still shows the submitter their own talk', async () => {
		const titles = (await mySubmissions(submitter.id)).map((s) => s.title);
		expect(titles).toContain('The two-person talk');
	});
});
