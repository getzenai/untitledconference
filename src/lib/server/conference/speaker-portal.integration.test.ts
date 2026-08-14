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
import { db, withRequestScopedDb } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import {
	cfpFormTable,
	formFieldTable,
	submissionAnswerTable,
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

		const [form] = await db
			.select({ id: cfpFormTable.id })
			.from(cfpFormTable)
			.where(eq(cfpFormTable.conferenceId, conference.id));
		const [booleanField] = await db
			.insert(formFieldTable)
			.values({
				cfpFormId: form.id,
				label: 'Have you given this talk before?',
				kind: 'boolean'
			})
			.returning({ id: formFieldTable.id });
		await db
			.insert(submissionAnswerTable)
			.values({ submissionId: talkId, formFieldId: booleanField.id, value: 'true' });

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

	it('returns the field kind needed to present boolean answers', async () => {
		const detail = await mySubmission(coSpeaker.id, talkId);

		expect(detail?.answers).toContainEqual({
			label: 'Have you given this talk before?',
			kind: 'boolean',
			value: 'true'
		});
	});

	it('shows the co-speaker the task written for them', async () => {
		const tasks = await myTasks(coSpeaker.id);
		expect(tasks).toContainEqual(expect.objectContaining({ id: taskId, submissionId: talkId }));
	});

	it('still shows the submitter their own talk', async () => {
		const titles = (await mySubmissions(submitter.id)).map((s) => s.title);
		expect(titles).toContain('The two-person talk');
	});
});

/**
 * The read that claims must also return what it just claimed.
 *
 * `ownProfileIds` does both in one statement, and a statement does not see its
 * own CTE's write: the select half runs against the snapshot the update started
 * from, so a profile claimed by this very call is invisible to it. The `union`
 * with the update's `returning` is what closes that.
 *
 * The co-speaker fixture above already fails if the union goes (checked, by
 * removing it). This one covers the case that fixture cannot: a speaker holding
 * a claimed profile *and* an unclaimed one, where the select half comes back
 * non-empty and a wrong answer therefore still looks like an answer.
 *
 * Production reaches it the moment someone with a profile of their own is named
 * as a co-speaker by a second organizer.
 */
describe('mySubmissions when one profile is already claimed and another is not', () => {
	let ownOrgId = '';
	let invitedOrgId = '';
	let speaker: { id: string; email: string };

	beforeAll(async () => {
		const own = await makeOrg('mixed-own');
		const invited = await makeOrg('mixed-invited');
		ownOrgId = own.organizationId;
		invitedOrgId = invited.organizationId;
		speaker = await makeUser('mixed');

		const [claimed] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: ownOrgId,
				userId: speaker.id,
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		// The other organizer's roster: same address, no account attached yet.
		const [unclaimed] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: invitedOrgId,
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		await proposalFor(
			own.conference.id,
			claimed.id,
			'The talk she proposed herself',
			new Date('2027-02-01T09:00:00.000Z')
		);
		await proposalFor(
			invited.conference.id,
			unclaimed.id,
			'The talk she was invited to',
			new Date('2027-02-02T09:00:00.000Z')
		);
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, ownOrgId));
		await db.delete(organization).where(eq(organization.id, invitedOrgId));
		await db.delete(user).where(eq(user.id, speaker.id));
	});

	it('shows both on the first read, not only from the second one on', async () => {
		const titles = (await mySubmissions(speaker.id)).map((s) => s.title);

		expect(titles).toContain('The talk she proposed herself');
		expect(titles).toContain('The talk she was invited to');
	});

	it('leaves the claim in place, so a second read is not a second write', async () => {
		await mySubmissions(speaker.id);

		const profiles = await db
			.select({ userId: speakerProfileTable.userId })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.organizationId, invitedOrgId));

		expect(profiles).toEqual([{ userId: speaker.id }]);
	});
});

/**
 * Two requests racing for the same unclaimed profile.
 *
 * Not `/portal`'s own `Promise.all`: `db` is `max: 1`, and one backend runs one
 * statement at a time, so those two are serial however they are dispatched —
 * the second starts on a snapshot that already contains the first's claim.
 * Measured, not assumed: this test passes against both query shapes when both
 * calls share a connection.
 *
 * Two *requests* is the real case — two tabs, two Workers, two connections,
 * one person's first visit. Both start on a snapshot where the profile is
 * unclaimed; one claims it, and the other's `update` matches nothing, because
 * READ COMMITTED re-checks `user_id is null` against the row the winner
 * committed. The loser is left with an empty `returning` and a select still
 * sitting on the pre-claim snapshot.
 *
 * So an answer built from `returning` is an answer about who won a lock. This
 * test fails against that shape and passes against the one that states the
 * membership in its own `where`.
 */
describe('two requests racing for the same unclaimed profile', () => {
	let orgId = '';
	let speaker: { id: string; email: string };

	beforeAll(async () => {
		const org = await makeOrg('race');
		orgId = org.organizationId;
		speaker = await makeUser('race');

		const [profile] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: orgId,
				name: 'Nadia Okafor',
				sortName: 'Okafor, Nadia',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		await proposalFor(
			org.conference.id,
			profile.id,
			'The talk nobody has claimed yet',
			new Date('2027-03-01T09:00:00.000Z')
		);
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(eq(user.id, speaker.id));
	});

	it('shows the proposal to both, not only to whichever one won the claim', async () => {
		// One scope per call is one connection per call — the same thing two
		// requests get, and the only way to put two of these statements on two
		// snapshots at once.
		const asOneRequest = () =>
			withRequestScopedDb(
				() => mySubmissions(speaker.id),
				(closing) => void closing
			);

		// Whether the two statements actually overlap is up to the scheduler, so
		// one pair is a coin toss: against the `union` shape a single pair caught
		// the defect roughly one run in three. Eight independent races, each from
		// an unclaimed profile, turn that into a test that fails when the defect
		// is there — and it stays deterministic in the other direction, because a
		// correct answer does not depend on the timing at all.
		for (let round = 0; round < 8; round++) {
			await db
				.update(speakerProfileTable)
				.set({ userId: null })
				.where(eq(speakerProfileTable.organizationId, orgId));

			const [first, second] = await Promise.all([asOneRequest(), asOneRequest()]);

			expect(first.map((s) => s.title)).toContain('The talk nobody has claimed yet');
			expect(second.map((s) => s.title)).toContain('The talk nobody has claimed yet');
		}
	});
});

/**
 * Someone else's profile that happens to carry this address.
 *
 * The select's second disjunct is `sp.user_id is null and sp.email = u.email`,
 * and the `is null` is the whole guard: without it the condition reads "mine or
 * addressed to me", and per #229 an account can put another person's address on
 * a profile it holds itself. Then the address alone would hand over that
 * profile's proposals.
 *
 * Nothing above this catches that — every fixture there is a profile the
 * speaker genuinely owns, so both shapes agree. This one disagrees with them:
 * it goes red the moment the conjunct falls, which is the only reason it is
 * here.
 */
describe('mySubmissions when another account already holds a profile with this address', () => {
	let orgId = '';
	let speaker: { id: string; email: string };
	let impostor: { id: string; email: string };

	beforeAll(async () => {
		const org = await makeOrg('foreign');
		orgId = org.organizationId;
		speaker = await makeUser('foreign-speaker');
		impostor = await makeUser('foreign-impostor');

		// The impostor's own profile, but with the speaker's address written on it.
		const [theirs] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: orgId,
				userId: impostor.id,
				name: 'Not Priya',
				sortName: 'Priya, Not',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		await proposalFor(
			org.conference.id,
			theirs.id,
			'The talk that is none of her business',
			new Date('2027-04-01T09:00:00.000Z')
		);
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(eq(user.id, speaker.id));
		await db.delete(user).where(eq(user.id, impostor.id));
	});

	it('does not show it to the person whose address is on it', async () => {
		const titles = (await mySubmissions(speaker.id)).map((s) => s.title);

		expect(titles).not.toContain('The talk that is none of her business');
	});

	it('leaves the other account’s claim alone', async () => {
		await mySubmissions(speaker.id);

		const profiles = await db
			.select({ userId: speakerProfileTable.userId })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.organizationId, orgId));

		expect(profiles).toEqual([{ userId: impostor.id }]);
	});
});

/**
 * The deadline the proposal page quotes at a speaker (#498).
 *
 * "You can still change it until the call closes" named no moment; the only
 * screen that did was the editor, behind the button that sentence describes. The
 * moment now comes off the submission, which means it has to be the *published*
 * form's — a draft form's dates are the organizer's working copy, and quoting
 * those at a speaker would be worse than saying nothing.
 */
describe('mySubmission and the call deadline', () => {
	const tag = 'closes';
	let orgId = '';
	let speaker: { id: string; email: string };
	let submissionId = 0;

	const published = new Date('2027-02-15T22:59:00.000Z');
	const draftForm = new Date('2027-09-09T09:09:00.000Z');

	beforeAll(async () => {
		const org = await makeOrg(tag);
		orgId = org.organizationId;
		speaker = await makeUser(tag);

		// `makeOrg` already published one form; this is the organizer's next one,
		// still a draft, with a date that must not reach the speaker.
		await db
			.update(cfpFormTable)
			.set({ closesAt: published })
			.where(eq(cfpFormTable.conferenceId, org.conference.id));
		await db.insert(cfpFormTable).values({
			conferenceId: org.conference.id,
			title: 'Next year',
			status: 'draft',
			closesAt: draftForm
		});

		const [profile] = await db
			.insert(speakerProfileTable)
			.values({
				organizationId: orgId,
				userId: speaker.id,
				name: 'Priya Raman',
				sortName: 'Raman, Priya',
				email: speaker.email
			})
			.returning({ id: speakerProfileTable.id });

		submissionId = await proposalFor(
			org.conference.id,
			profile.id,
			'Build systems without the wait',
			new Date('2027-01-04T09:00:00.000Z')
		);
	});

	afterAll(async () => {
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(eq(user.id, speaker.id));
	});

	it('carries the published call’s closing moment, not the draft form’s', async () => {
		const submission = await mySubmission(speaker.id, submissionId);

		expect(submission?.callClosesAt).toEqual(published);
	});
});
