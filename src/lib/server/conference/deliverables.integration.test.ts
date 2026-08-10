/**
 * The speaker's side of tasks and deliverables.
 *
 * The assertions that matter here are about who gets to see a file. A
 * deliverable is an unreleased slide deck or someone's headshot, and the failure
 * mode is not a crash — it is a stranger quietly downloading it. That kind of
 * bug typechecks, lints, and looks right in review, so it needs a test that
 * fails without the ownership condition.
 *
 * Storage is not exercised: the bytes live in R2 and there is no bucket here.
 * What is tested is everything around it — versioning, ownership, status.
 */
import { MAX_UPLOAD_BYTES, rejectUpload } from '$lib/conference/upload-limits';
import { objectKey, safeFilename } from '$lib/server/conference/deliverable-storage';
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	addFileComment,
	nextVersion,
	ownDeliverable,
	ownTask,
	recordDeliverable,
	setActionTaskDone,
	taskFiles
} from './deliverables';

const suffix = `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const speakerUserId = `speaker-${suffix}`;
const strangerUserId = `stranger-${suffix}`;

let fileTaskId = 0;
let actionTaskId = 0;
/** A task belonging to somebody else entirely. */
let otherPersonsTaskId = 0;

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Deliverables Org',
		slug: organizationId,
		createdAt: new Date()
	});

	await db.insert(user).values([
		{
			id: speakerUserId,
			email: `${speakerUserId}@example.test`,
			emailVerified: true,
			name: 'Speaker'
		},
		{
			id: strangerUserId,
			email: `${strangerUserId}@example.test`,
			emailVerified: true,
			name: 'Stranger'
		}
	]);

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Deliverables Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();

	const [mine] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, userId: speakerUserId, name: 'A Speaker', sortName: 'Speaker, A' })
		.returning();
	const [theirs] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: strangerUserId,
			name: 'Someone Else',
			sortName: 'Else, Someone'
		})
		.returning();

	const [fileTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: conference.id,
			speakerProfileId: mine.id,
			title: 'Upload final slides',
			kind: 'file_request'
		})
		.returning();
	const [actionTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: conference.id,
			speakerProfileId: mine.id,
			title: 'Confirm participation',
			kind: 'action'
		})
		.returning();
	const [otherTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: conference.id,
			speakerProfileId: theirs.id,
			title: 'Someone else’s confirmation',
			// An action task on purpose: a file request is refused for everyone, so
			// it could not tell an ownership failure from a kind failure.
			kind: 'action'
		})
		.returning();

	fileTaskId = fileTask.id;
	actionTaskId = actionTask.id;
	otherPersonsTaskId = otherTask.id;
});

afterAll(async () => {
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, speakerUserId));
	await db.delete(user).where(eq(user.id, strangerUserId));
});

describe('ownTask', () => {
	it('gives a speaker their own task', async () => {
		const task = await ownTask(speakerUserId, fileTaskId);
		expect(task?.title).toBe('Upload final slides');
	});

	it('gives a stranger nothing, even signed in', async () => {
		// The whole authorization model in one assertion: being logged in is not
		// the question.
		expect(await ownTask(strangerUserId, fileTaskId)).toBeNull();
	});
});

describe('versioning (CNT-04)', () => {
	it('numbers a re-upload upward and keeps the earlier file', async () => {
		const first = await nextVersion(fileTaskId);
		await recordDeliverable({
			taskId: fileTaskId,
			userId: speakerUserId,
			fileUrl: 'k/1',
			filename: 'slides.pdf',
			contentType: 'application/pdf',
			sizeBytes: 100,
			version: first
		});

		const second = await nextVersion(fileTaskId);
		await recordDeliverable({
			taskId: fileTaskId,
			userId: speakerUserId,
			fileUrl: 'k/2',
			filename: 'slides-final.pdf',
			contentType: 'application/pdf',
			sizeBytes: 120,
			version: second
		});

		expect(second).toBe(first + 1);

		const files = await taskFiles(fileTaskId);
		// Newest first, and the older one is still there — an overwrite would
		// destroy exactly what the criterion asks to see.
		expect(files.map((f) => f.version)).toEqual([second, first]);
		expect(files.map((f) => f.filename)).toContain('slides.pdf');
	});

	it('marks the task handed in when a file arrives', async () => {
		const [task] = await db
			.select({ status: taskTable.status })
			.from(taskTable)
			.where(eq(taskTable.id, fileTaskId));

		// A deliverable sitting under a task that still says "open" would send the
		// organizer chasing something they already have.
		expect(task.status).toBe('submitted');
	});
});

describe('ownDeliverable — the download gate', () => {
	it('hands a speaker their own file', async () => {
		const [file] = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId))
			.limit(1);

		expect(await ownDeliverable(speakerUserId, file.id)).not.toBeNull();
	});

	it('refuses a stranger the file, which is the point of the route', async () => {
		const [file] = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId))
			.limit(1);

		// Without the ownership condition in the query this returns the row and
		// the download route serves an unreleased deck to anyone with an account.
		expect(await ownDeliverable(strangerUserId, file.id)).toBeNull();
	});
});

describe('comments (CNT-05)', () => {
	it('records a comment on your own file', async () => {
		const [file] = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId))
			.limit(1);

		expect(await addFileComment(speakerUserId, file.id, 'Slides are final now.')).not.toBeNull();

		const files = await taskFiles(fileTaskId);
		const commented = files.find((f) => f.id === file.id);
		expect(commented?.comments.map((c) => c.body)).toContain('Slides are final now.');
	});

	it('refuses a comment on a file that is not yours', async () => {
		const [file] = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId))
			.limit(1);

		expect(await addFileComment(strangerUserId, file.id, 'Nice deck')).toBeNull();
	});

	it('ignores an empty comment rather than storing a blank row', async () => {
		const [file] = await db
			.select({ id: deliverableTable.id })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, fileTaskId))
			.limit(1);

		expect(await addFileComment(speakerUserId, file.id, '   ')).toBeNull();
	});
});

describe('action tasks', () => {
	it('ticks off and reopens a task with no file attached', async () => {
		expect(await setActionTaskDone(speakerUserId, actionTaskId, true)).toBe(true);
		const [done] = await db
			.select({ status: taskTable.status, completedAt: taskTable.completedAt })
			.from(taskTable)
			.where(eq(taskTable.id, actionTaskId));
		expect(done.status).toBe('done');
		expect(done.completedAt).not.toBeNull();

		expect(await setActionTaskDone(speakerUserId, actionTaskId, false)).toBe(true);
		const [reopened] = await db
			.select({ status: taskTable.status, completedAt: taskTable.completedAt })
			.from(taskTable)
			.where(eq(taskTable.id, actionTaskId));
		expect(reopened.status).toBe('open');
		expect(reopened.completedAt).toBeNull();
	});

	it('refuses to tick off a file request', async () => {
		// Otherwise the status would claim something the empty deliverable list
		// flatly contradicts.
		expect(await setActionTaskDone(speakerUserId, fileTaskId, true)).toBe(false);
	});

	it('refuses to tick off someone else’s task', async () => {
		// The owner can, so the refusal below is about ownership and nothing else.
		expect(await setActionTaskDone(strangerUserId, otherPersonsTaskId, true)).toBe(true);
		expect(await setActionTaskDone(speakerUserId, otherPersonsTaskId, true)).toBe(false);
	});
});

describe('the key and the header are built from sanitised names', () => {
	it('strips path separators and control characters out of a filename', () => {
		// A header built from stored data must not depend on every past writer
		// having been careful: a stray CR/LF would be a second header.
		expect(safeFilename('../../etc/passwd')).toBe('passwd');
		expect(safeFilename('slides.pdf')).toBe('slides.pdf');

		// Assert the property, not the spelling: what matters is that no CR or LF
		// survives, whatever the replacement happens to look like.
		const injected = safeFilename('deck\r\nX-Evil: yes.pdf');
		expect(injected).not.toMatch(/[\r\n]/);
		expect(injected).toContain('.pdf');
	});

	it('never lets a filename escape its own segment of the key', () => {
		const key = objectKey(1, 2, 3, '../../../secret.pdf');
		// Asserted as a shape rather than a literal, because the key carries a nonce
		// segment. What must hold is that the traversal is gone and the name occupies
		// exactly the last segment.
		expect(key).toMatch(/^conference\/1\/task\/2\/v3\/[0-9a-f]{6}\/secret\.pdf$/);
		expect(key).not.toContain('..');
	});

	it('gives two simultaneous uploads different keys', () => {
		// Same task, same version, same filename — the case where both callers read
		// the same max(version) before either inserts. Without distinct keys the
		// loser's put overwrites the winner's object and the surviving row serves
		// somebody else's bytes.
		expect(objectKey(1, 2, 3, 'slides.pdf')).not.toBe(objectKey(1, 2, 3, 'slides.pdf'));
	});

	it('refuses SVG, the one image type that carries script', () => {
		expect(rejectUpload({ size: 10, type: 'image/svg+xml' })).toBe('unsupported_type');
		expect(rejectUpload({ size: 10, type: 'image/png' })).toBeNull();
	});

	it('enforces the size limit on the server, not only in the form', () => {
		expect(rejectUpload({ size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf' })).toBe('too_large');
		expect(rejectUpload({ size: 0, type: 'application/pdf' })).toBe('empty');
	});
});
