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
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actions } from './+page.server';

const suffix = `upload-guard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerUserId = `speaker-${suffix}`;

let fileTaskId = 0;
let actionTaskId = 0;

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
			title: 'Confirm participation',
			kind: 'action'
		})
		.returning();

	fileTaskId = fileTask.id;
	actionTaskId = actionTask.id;
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
