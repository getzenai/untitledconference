/**
 * Accepting a talk is the most expensive handoff in the product (Ü6/Ü7): it has to
 * produce a planable session and the speaker's tasks, or somebody types the
 * conference in a second time. Notification is intentionally a separate action.
 */
import { db } from '$lib/server/db';
import { member, organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable, taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decideSubmissions } from './decisions';

const suffix = `decide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const OWNER = `owner-${suffix}`;

let conference: Conference;
let otherConference: Conference;
let speakerProfileId: number;
let submissionId: number;
let foreignSubmissionId: number;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Decision Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: OWNER,
		name: 'Ann Follows',
		email: `${OWNER}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	await db.insert(member).values({
		id: `m-${OWNER}`,
		organizationId,
		userId: OWNER,
		role: 'owner',
		createdAt: new Date()
	});

	[conference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'DevFlow Conf', slug: suffix })
		.returning();

	[otherConference] = await db
		.insert(conferenceTable)
		.values({ organizationId, name: 'Another Conf', slug: `${suffix}-other` })
		.returning();

	const [speaker] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: `priya-${suffix}@example.com`
		})
		.returning();
	speakerProfileId = speaker.id;

	await db.insert(taskTemplateTable).values([
		{
			conferenceId: conference.id,
			title: 'Upload headshot',
			kind: 'file_request',
			dueOffsetDays: 7
		},
		{ conferenceId: conference.id, title: 'Complete bio', kind: 'action', dueOffsetDays: 14 }
	]);
});

beforeEach(async () => {
	// A fresh submission per test: acceptance is not a pure function, and reusing one
	// row would let the first test decide the outcome of the second.
	await db.delete(submissionTable).where(eq(submissionTable.conferenceId, conference.id));
	await db.delete(emailLogTable).where(eq(emailLogTable.conferenceId, conference.id));
	await db
		.delete(conferenceSpeakerTable)
		.where(eq(conferenceSpeakerTable.conferenceId, conference.id));

	const [submission] = await db
		.insert(submissionTable)
		.values({ conferenceId: conference.id, title: 'Taming 40-minute CI', status: 'submitted' })
		.returning();
	submissionId = submission.id;

	await db
		.insert(submissionSpeakerTable)
		.values({ submissionId, speakerProfileId, isPrimary: true, position: 0 });

	const [foreign] = await db
		.insert(submissionTable)
		.values({ conferenceId: otherConference.id, title: 'Not yours', status: 'submitted' })
		.returning();
	foreignSubmissionId = foreign.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, OWNER));
});

describe('decideSubmissions — accepting', () => {
	it('sets the decision and internal consequences without notifying speakers', async () => {
		const result = await decideSubmissions(conference, [submissionId], 'accepted');

		expect(result).toMatchObject({
			decided: 1,
			sessionsCreated: 1,
			tasksCreated: 2
		});

		const [submission] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(submission.status).toBe('accepted');
		expect(submission.decidedAt).not.toBeNull();

		// Ü6 — in the tray: a session, tentative, with no slot yet.
		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(1);
		expect(placements[0]).toMatchObject({ kind: 'session', status: 'tentative' });
		expect(placements[0].conferenceDayId).toBeNull();
		expect(placements[0].roomId).toBeNull();

		const [conferenceSpeaker] = await db
			.select()
			.from(conferenceSpeakerTable)
			.where(
				and(
					eq(conferenceSpeakerTable.conferenceId, conference.id),
					eq(conferenceSpeakerTable.speakerProfileId, speakerProfileId)
				)
			);
		expect(conferenceSpeaker.status).toBe('confirmed');

		// Ü7 — the portal is not empty when the speaker first opens it.
		const tasks = await db.select().from(taskTable).where(eq(taskTable.submissionId, submissionId));
		expect(tasks.map((t) => t.title).sort()).toEqual(['Complete bio', 'Upload headshot']);
		expect(tasks.every((t) => t.dueOn !== null)).toBe(true);

		// The organizer may now sanity-check the programme before telling anyone.
		const emails = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submissionId));
		expect(emails).toHaveLength(0);
	});

	it('writes nothing at all the second time', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted');
		const second = await decideSubmissions(conference, [submissionId], 'accepted');

		expect(second).toMatchObject({
			decided: 0,
			unchanged: 1,
			sessionsCreated: 0,
			tasksCreated: 0
		});

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(1);

		const tasks = await db.select().from(taskTable).where(eq(taskTable.submissionId, submissionId));
		expect(tasks).toHaveLength(2);

		const emails = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submissionId));
		expect(emails).toHaveLength(0);
	});
});

describe('decideSubmissions — taking an acceptance back', () => {
	it('clears the agenda tray and the untouched tasks', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted');
		const result = await decideSubmissions(conference, [submissionId], 'rejected');

		expect(result).toMatchObject({ decided: 1, sessionsRemoved: 1, tasksRemoved: 2 });

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(0);

		const tasks = await db.select().from(taskTable).where(eq(taskTable.submissionId, submissionId));
		expect(tasks).toHaveLength(0);
	});

	it('leaves a confirmed slot and a task the speaker already worked on alone', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted');

		// The organizer scheduled it by hand, and the speaker uploaded something.
		await db
			.update(placementTable)
			.set({ status: 'confirmed' })
			.where(eq(placementTable.submissionId, submissionId));
		const [firstTask] = await db
			.select()
			.from(taskTable)
			.where(eq(taskTable.submissionId, submissionId));
		await db.update(taskTable).set({ status: 'submitted' }).where(eq(taskTable.id, firstTask.id));

		const result = await decideSubmissions(conference, [submissionId], 'rejected');

		// A bulk click must not silently empty a slot people were told about, nor
		// delete an upload. Both stay, visibly wrong, for a human to resolve.
		expect(result).toMatchObject({ sessionsRemoved: 0, tasksRemoved: 1 });

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(1);
		expect(placements[0].status).toBe('confirmed');

		const tasks = await db.select().from(taskTable).where(eq(taskTable.submissionId, submissionId));
		expect(tasks.map((t) => t.id)).toEqual([firstTask.id]);
	});

	it('re-accepting after a decline puts the internal work back', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted');
		await decideSubmissions(conference, [submissionId], 'rejected');
		const again = await decideSubmissions(conference, [submissionId], 'accepted');

		expect(again).toMatchObject({
			decided: 1,
			sessionsCreated: 1,
			tasksCreated: 2
		});
	});
});

describe('decideSubmissions — declining', () => {
	it('records the decision without mail and puts nothing in the programme', async () => {
		const result = await decideSubmissions(conference, [submissionId], 'rejected');

		expect(result).toMatchObject({
			decided: 1,
			sessionsCreated: 0,
			tasksCreated: 0
		});

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(0);

		const emails = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submissionId));
		expect(emails).toHaveLength(0);
	});
});

/**
 * #447. Three ways out of the meeting. Resubmit is not a decline wearing a
 * note: the status is its own, the guidance is required, and nothing is mailed.
 */
describe('decideSubmissions — the three decline-path outcomes', () => {
	it('asks them back under a new name, with the sentence attached', async () => {
		const result = await decideSubmissions(
			conference,
			[submissionId],
			'resubmit_with_guidance',
			null,
			'resubmit with your client'
		);

		expect(result).toMatchObject({ decided: 1, sessionsCreated: 0, tasksCreated: 0 });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('resubmit_with_guidance');
		expect(row.resubmitGuidance).toBe('resubmit with your client');
		expect(row.declineNote).toBeNull();
		expect(row.acceptCondition).toBeNull();

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(0);

		const emails = await db
			.select()
			.from(emailLogTable)
			.where(eq(emailLogTable.relatedId, submissionId));
		expect(emails).toHaveLength(0);
	});

	it('refuses a resubmit that has no sentence, and writes nothing', async () => {
		await expect(
			decideSubmissions(conference, [submissionId], 'resubmit_with_guidance')
		).rejects.toThrow('missing_guidance');

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('submitted');
	});

	it('keeps a champion sentence on a decline, and does not pretend it is a resubmit', async () => {
		const result = await decideSubmissions(
			conference,
			[submissionId],
			'rejected',
			null,
			'closest we had — try again with the case study'
		);

		expect(result).toMatchObject({ decided: 1, sessionsCreated: 0 });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('rejected');
		expect(row.declineNote).toBe('closest we had — try again with the case study');
		expect(row.resubmitGuidance).toBeNull();
	});

	it('lets a decline go out with no sentence at all', async () => {
		await decideSubmissions(conference, [submissionId], 'rejected');

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('rejected');
		expect(row.declineNote).toBeNull();
	});

	it('takes the tray slot back when an accept becomes a resubmit', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted');
		const result = await decideSubmissions(
			conference,
			[submissionId],
			'resubmit_with_guidance',
			null,
			'come back with the client on stage'
		);

		expect(result).toMatchObject({ decided: 1, sessionsRemoved: 1, tasksRemoved: 2 });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('resubmit_with_guidance');
		expect(row.acceptCondition).toBeNull();
		expect(row.resubmitGuidance).toBe('come back with the client on stage');
	});
});

describe('decideSubmissions — scoping', () => {
	it('ignores ids that belong to a different conference', async () => {
		const result = await decideSubmissions(
			conference,
			[submissionId, foreignSubmissionId],
			'accepted'
		);

		expect(result.decided).toBe(1);

		const [foreign] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, foreignSubmissionId));
		expect(foreign.status).toBe('submitted');
	});

	it('does nothing at all for an empty selection', async () => {
		const result = await decideSubmissions(conference, [], 'accepted');
		expect(result).toEqual({
			decided: 0,
			unchanged: 0,
			skippedDrafts: 0,
			sessionsCreated: 0,
			tasksCreated: 0,
			sessionsRemoved: 0,
			tasksRemoved: 0
		});
	});
});

describe('decideSubmissions — drafts', () => {
	/**
	 * A draft is the speaker's private, unfinished form. Accepting one produced a row
	 * the UI cannot make — `accepted` with `submittedAt: null` — and put a talk nobody
	 * handed in into the agenda tray with its speakers confirmed (#321).
	 */
	it('leaves a never-submitted draft alone and says so', async () => {
		const [draft] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Half a thought', status: 'draft' })
			.returning();
		await db
			.insert(submissionSpeakerTable)
			.values({ submissionId: draft.id, speakerProfileId, isPrimary: true, position: 0 });

		const result = await decideSubmissions(conference, [draft.id], 'accepted');

		expect(result).toMatchObject({ decided: 0, unchanged: 0, skippedDrafts: 1 });

		const [after] = await db.select().from(submissionTable).where(eq(submissionTable.id, draft.id));
		expect(after.status).toBe('draft');
		expect(after.decidedAt).toBeNull();

		// The consequence that made this visible downstream: no slot, so nothing to place.
		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, draft.id));
		expect(placements).toHaveLength(0);
	});

	it('still decides the submitted rows selected alongside a draft', async () => {
		const [draft] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Half a thought', status: 'draft' })
			.returning();

		const result = await decideSubmissions(conference, [submissionId, draft.id], 'accepted');

		expect(result).toMatchObject({ decided: 1, skippedDrafts: 1, sessionsCreated: 1 });
	});
});

describe('decideSubmissions — a condition on the accept', () => {
	it('keeps the talk accepted and writes the note', async () => {
		const result = await decideSubmissions(conference, [submissionId], 'accepted', {
			text: 'bring a co-presenter',
			ownerId: OWNER
		});

		expect(result).toMatchObject({ decided: 1, sessionsCreated: 1, tasksCreated: 2 });

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('accepted');
		expect(row.acceptCondition).toBe('bring a co-presenter');
		expect(row.acceptConditionOwnerId).toBe(OWNER);

		const placements = await db
			.select()
			.from(placementTable)
			.where(eq(placementTable.submissionId, submissionId));
		expect(placements).toHaveLength(1);
	});

	it('leaves an existing note alone when a later bulk accept includes the row', async () => {
		const [other] = await db
			.insert(submissionTable)
			.values({ conferenceId: conference.id, title: 'Also good', status: 'submitted' })
			.returning();
		await db.insert(submissionSpeakerTable).values({
			submissionId: other.id,
			speakerProfileId,
			isPrimary: true,
			position: 0
		});

		await decideSubmissions(conference, [submissionId], 'accepted', {
			text: 'bring a co-presenter',
			ownerId: OWNER
		});
		// The write would null the note if the already-accepted row were not
		// filtered out of `targets` first. The clean accept on the second talk
		// is the shot that would have wiped the first.
		const second = await decideSubmissions(conference, [submissionId, other.id], 'accepted');

		expect(second).toMatchObject({ decided: 1, unchanged: 1 });

		const [kept] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(kept.acceptCondition).toBe('bring a co-presenter');
		expect(kept.acceptConditionOwnerId).toBe(OWNER);

		const [fresh] = await db.select().from(submissionTable).where(eq(submissionTable.id, other.id));
		expect(fresh.status).toBe('accepted');
		expect(fresh.acceptCondition).toBeNull();
	});

	it('drops the note when the accept is taken back', async () => {
		await decideSubmissions(conference, [submissionId], 'accepted', {
			text: 'bring a co-presenter',
			ownerId: OWNER
		});
		await decideSubmissions(conference, [submissionId], 'rejected');

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('rejected');
		expect(row.acceptCondition).toBeNull();
		expect(row.acceptConditionOwnerId).toBeNull();
	});

	it('refuses an owner who cannot chase the note, and writes nothing', async () => {
		await expect(
			decideSubmissions(conference, [submissionId], 'accepted', {
				text: 'bring a co-presenter',
				ownerId: 'nobody-here'
			})
		).rejects.toThrow('invalid_condition_owner');

		const [row] = await db
			.select()
			.from(submissionTable)
			.where(eq(submissionTable.id, submissionId));
		expect(row.status).toBe('submitted');
		expect(row.acceptCondition).toBeNull();
	});
});
