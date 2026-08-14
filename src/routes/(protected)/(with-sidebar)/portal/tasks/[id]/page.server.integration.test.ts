/**
 * The `?/upload` action's kind guard.
 *
 * The page only draws the upload form for a file request, so this is the layer
 * that decides what a directly posted form can do. It was reviewed as safe on
 * the strength of the UI branch alone and was not: an action task accepted a
 * deliverable, and from there its `task.status` had two authors — the owner's
 * tick and the newest file's approval.
 *
 * The bucket here is a stub that records what it was asked to store, because
 * "refused" has to mean the bytes never left: a rejection after the put leaves
 * an object nothing points at.
 */
import { myTasks } from '$lib/server/conference/speaker-portal';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	conferenceTable,
	roomTable,
	speakerProfileTable
} from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server';

const suffix = `upload-guard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerUserId = `speaker-${suffix}`;

let conferenceId = 0;
let fileTaskId = 0;
let actionTaskId = 0;
let speakerProfileId = 0;

/** What the action was asked to store, in order. Empty means nothing was put. */
let stored: string[] = [];

function uploadEvent(taskId: number) {
	const body = new FormData();
	body.append('file', new File(['%PDF-1.4 slides'], 'slides.pdf', { type: 'application/pdf' }));

	return {
		request: new Request(`http://localhost/portal/tasks/${taskId}?/upload`, {
			method: 'POST',
			body
		}),
		params: { id: String(taskId) },
		locals: { user: { id: speakerUserId } },
		platform: {
			env: {
				UPLOADS: {
					put: async (key: string) => {
						stored.push(key);
						return {};
					}
				}
			}
		}
	} as unknown as Parameters<typeof actions.upload>[0];
}

function participationEvent(taskId: number, decision: string) {
	const body = new FormData();
	body.set('decision', decision);
	return {
		request: new Request(`http://localhost/portal/tasks/${taskId}?/participation`, {
			method: 'POST',
			body
		}),
		params: { id: String(taskId) },
		locals: { user: { id: speakerUserId } }
	} as unknown as Parameters<typeof actions.participation>[0];
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Upload Guard Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values({
		id: speakerUserId,
		email: `${speakerUserId}@example.test`,
		emailVerified: true,
		name: 'Speaker'
	});

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Upload Guard Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	const [profile] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, userId: speakerUserId, name: 'A Speaker', sortName: 'Speaker, A' })
		.returning();
	await db.insert(conferenceSpeakerTable).values({
		conferenceId: conference.id,
		speakerProfileId: profile.id,
		status: 'invited'
	});
	const [submission] = await db
		.insert(submissionTable)
		.values({
			conferenceId: conference.id,
			title: 'Shipping without the wait',
			status: 'accepted'
		})
		.returning();
	const [room] = await db
		.insert(roomTable)
		.values({ conferenceId: conference.id, name: 'Main Stage' })
		.returning();
	await db.insert(placementTable).values({
		conferenceId: conference.id,
		submissionId: submission.id,
		kind: 'session',
		status: 'confirmed',
		startsAt: new Date('2027-05-12T09:00:00Z'),
		endsAt: new Date('2027-05-12T09:45:00Z'),
		roomId: room.id
	});

	const [fileTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: conference.id,
			speakerProfileId: profile.id,
			title: 'Upload final slides',
			kind: 'file_request'
		})
		.returning();
	const [actionTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: conference.id,
			speakerProfileId: profile.id,
			submissionId: submission.id,
			title: 'Confirm participation',
			kind: 'action'
		})
		.returning();

	conferenceId = conference.id;
	fileTaskId = fileTask.id;
	actionTaskId = actionTask.id;
	speakerProfileId = profile.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, speakerUserId));
});

describe('?/upload', () => {
	it('refuses an action task before a byte is stored', async () => {
		stored = [];

		const result = (await actions.upload(uploadEvent(actionTaskId))) as {
			status: number;
			data: { uploadError: string };
		};

		expect(result.status).toBe(400);
		expect(result.data.uploadError).toMatch(/ticked off/);

		// The point of the guard's position. A 400 after the put would still leave
		// the object behind, and the test would pass on the status alone.
		expect(stored).toEqual([]);

		const files = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, actionTaskId));
		expect(files).toHaveLength(0);

		const [task] = await db
			.select({ status: taskTable.status })
			.from(taskTable)
			.where(eq(taskTable.id, actionTaskId));
		expect(task.status).toBe('open');
	});

	it('still takes the file a file request asked for', async () => {
		// Without this the guard could be refusing everything and the test above
		// would not notice.
		stored = [];

		const result = (await actions.upload(uploadEvent(fileTaskId))) as {
			uploaded: boolean;
			version: number;
		};

		expect(result.uploaded).toBe(true);
		expect(result.version).toBe(1);
		expect(stored).toHaveLength(1);

		const files = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId));
		expect(files).toHaveLength(1);

		const [task] = await db
			.select({ status: taskTable.status })
			.from(taskTable)
			.where(eq(taskTable.id, fileTaskId));
		expect(task.status).toBe('submitted');
	});
});

describe('?/participation', () => {
	it('loads the accepted session and its confirmed time and room', async () => {
		const data = await load({
			params: { id: String(actionTaskId) },
			locals: { user: { id: speakerUserId } }
		} as never);
		if (!data) throw new Error('Task load returned no data');

		expect(data.task).toMatchObject({
			submissionTitle: 'Shipping without the wait',
			sessionStartsAt: new Date('2027-05-12T09:00:00Z'),
			sessionEndsAt: new Date('2027-05-12T09:45:00Z'),
			sessionRoom: 'Main Stage',
			participationStatus: 'invited'
		});
	});

	it('turns a real response into roster state and a completed task', async () => {
		const result = (await actions.participation(participationEvent(actionTaskId, 'confirmed'))) as {
			participation: string;
		};
		expect(result.participation).toBe('confirmed');

		const [membership] = await db
			.select({ status: conferenceSpeakerTable.status })
			.from(conferenceSpeakerTable)
			.where(eq(conferenceSpeakerTable.speakerProfileId, speakerProfileId));
		const [task] = await db
			.select({ status: taskTable.status })
			.from(taskTable)
			.where(eq(taskTable.id, actionTaskId));

		expect(membership.status).toBe('confirmed');
		expect(task.status).toBe('done');
	});

	/**
	 * The number the withdrawal dialog puts in front of the speaker (#495).
	 *
	 * "This withdraws you from two accepted talks" is a different decision from
	 * "from this one", and the answer is stored per conference, so the count
	 * cannot come from the task's own submission. Only a participation task pays
	 * for the query.
	 */
	it('counts this speaker’s accepted talks for the withdrawal dialog', async () => {
		const accepted = await db
			.insert(submissionTable)
			.values([
				{ conferenceId, title: 'Shipping without the wait', status: 'accepted' as const },
				{ conferenceId, title: 'A second accepted talk', status: 'accepted' as const }
			])
			.returning();
		await db.insert(submissionSpeakerTable).values(
			accepted.map((row) => ({
				submissionId: row.id,
				speakerProfileId,
				isPrimary: true,
				position: 0
			}))
		);
		// Proposed, not accepted: it is not part of what a withdrawal costs.
		const [pending] = await db
			.insert(submissionTable)
			.values({ conferenceId, title: 'Still under review', status: 'submitted' })
			.returning();
		await db.insert(submissionSpeakerTable).values({
			submissionId: pending.id,
			speakerProfileId,
			isPrimary: true,
			position: 0
		});

		const participation = await load({
			params: { id: String(actionTaskId) },
			locals: { user: { id: speakerUserId } }
		} as never);
		expect(participation?.acceptedTalks).toBe(2);

		// A file request never draws the dialog, so it never runs the count.
		const upload = await load({
			params: { id: String(fileTaskId) },
			locals: { user: { id: speakerUserId } }
		} as never);
		expect(upload?.acceptedTalks).toBe(0);
	});

	/**
	 * A withdrawal is an answer, not an achievement (#495). The task list needs
	 * the answer to stop printing a tick next to it and counting it as done.
	 */
	it('carries the withdrawal into the portal task list', async () => {
		await actions.participation(participationEvent(actionTaskId, 'declined'));

		const tasks = await myTasks(speakerUserId);
		const participation = tasks.find((row) => row.id === actionTaskId);

		expect(participation).toMatchObject({ status: 'done', participationStatus: 'declined' });
	});
});
