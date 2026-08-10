/**
 * Accepting a talk is the most expensive handoff in the product (Ü6/Ü7): it has to
 * produce a planable session and the speaker's tasks, or somebody types the
 * conference in a second time. Notification is intentionally a separate action.
 */
import { db } from '$lib/server/db';
import { organization } from '$lib/server/db/auth-schema';
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
			sessionsCreated: 0,
			tasksCreated: 0,
			sessionsRemoved: 0,
			tasksRemoved: 0
		});
	});
});
