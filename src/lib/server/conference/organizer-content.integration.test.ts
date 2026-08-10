/**
 * The organizer's side of speaker files.
 *
 * The assertion that matters most is the one that looks like a weakening: this module
 * reaches files WITHOUT an ownership check, on purpose, because the organizer is not
 * the owner. So the tests have to pin the replacement boundary just as hard — a file
 * belonging to another conference must be unreachable, and the reachable ones must
 * include the case the portal cannot serve at all: a speaker with no account.
 */
import { db } from '$lib/server/db';
import { organization, user } from '$lib/server/db/auth-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { deliverableTable, taskTable } from '$lib/server/db/conference/content-schema';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	addOrganizerComment,
	conferenceDeliverable,
	conferenceTask,
	conferenceTaskFiles,
	contentOverview,
	contentTotals,
	setDeliverableApproval
} from './organizer-content';

const suffix = `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-${suffix}`;
const organizerId = `organizer-${suffix}`;
const speakerUserId = `speaker-${suffix}`;

let conferenceId = 0;
let otherConferenceId = 0;
let accountedTaskId = 0;
/** A task belonging to a speaker the organizer created — no login anywhere. */
let accountlessTaskId = 0;
let actionTaskId = 0;
let accountlessFileId = 0;
let foreignFileId = 0;

async function makeFile(taskId: number, filename: string, version = 1) {
	const [file] = await db
		.insert(deliverableTable)
		.values({
			taskId,
			fileUrl: `key/${filename}`,
			filename,
			contentType: 'application/pdf',
			sizeBytes: 100,
			version,
			uploadedBy: organizerId
		})
		.returning();
	return file.id;
}

beforeAll(async () => {
	await db.insert(organization).values({
		id: organizationId,
		name: 'Content Org',
		slug: organizationId,
		createdAt: new Date()
	});
	await db.insert(user).values([
		{ id: organizerId, email: `${organizerId}@example.test`, emailVerified: true, name: 'Jordan' },
		{
			id: speakerUserId,
			email: `${speakerUserId}@example.test`,
			emailVerified: true,
			name: 'Priya'
		}
	]);

	const [conference] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Content Conf',
			slug: `conf-${suffix}`,
			startsOn: '2027-05-12',
			endsOn: '2027-05-12',
			status: 'published'
		})
		.returning();
	conferenceId = conference.id;

	const [other] = await db
		.insert(conferenceTable)
		.values({
			organizationId,
			name: 'Other Conf',
			slug: `other-${suffix}`,
			startsOn: '2027-06-01',
			endsOn: '2027-06-01',
			status: 'published'
		})
		.returning();
	otherConferenceId = other.id;

	const [withAccount] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: speakerUserId,
			name: 'Priya Raman',
			sortName: 'Raman, Priya',
			email: 'priya@example.test'
		})
		.returning();

	// The case the speaker portal cannot serve: created by an organizer, no user_id.
	const [withoutAccount] = await db
		.insert(speakerProfileTable)
		.values({
			organizationId,
			userId: null,
			name: 'Ada Bennett',
			sortName: 'Bennett, Ada',
			email: 'ada@example.test'
		})
		.returning();

	const tasks = await db
		.insert(taskTable)
		.values([
			{
				conferenceId,
				speakerProfileId: withAccount.id,
				title: 'Upload final slides',
				kind: 'file_request',
				status: 'submitted'
			},
			{
				conferenceId,
				speakerProfileId: withoutAccount.id,
				title: 'Upload headshot',
				kind: 'file_request',
				status: 'submitted'
			},
			{
				conferenceId,
				speakerProfileId: withAccount.id,
				title: 'Confirm participation',
				kind: 'action',
				status: 'open'
			}
		])
		.returning();

	accountedTaskId = tasks[0].id;
	accountlessTaskId = tasks[1].id;
	actionTaskId = tasks[2].id;

	await makeFile(accountedTaskId, 'slides-v1.pdf', 1);
	await makeFile(accountedTaskId, 'slides-v2.pdf', 2);
	accountlessFileId = await makeFile(accountlessTaskId, 'headshot.png');

	const [foreignSpeaker] = await db
		.insert(speakerProfileTable)
		.values({ organizationId, name: 'Someone Else', sortName: 'Else, Someone' })
		.returning();
	const [foreignTask] = await db
		.insert(taskTable)
		.values({
			conferenceId: otherConferenceId,
			speakerProfileId: foreignSpeaker.id,
			title: 'Not your conference',
			kind: 'file_request'
		})
		.returning();
	foreignFileId = await makeFile(foreignTask.id, 'secret.pdf');
});

afterAll(async () => {
	await db.delete(conferenceTable).where(eq(conferenceTable.id, conferenceId));
	await db.delete(conferenceTable).where(eq(conferenceTable.id, otherConferenceId));
	await db.delete(organization).where(eq(organization.id, organizationId));
	await db.delete(user).where(eq(user.id, organizerId));
	await db.delete(user).where(eq(user.id, speakerUserId));
});

describe('the reason this module exists', () => {
	it('reaches a file whose speaker has no account at all', async () => {
		// Through the speaker portal this file is unreachable by anyone, because its
		// ownership check compares against a user_id that is null. On the demo tenant
		// that was a real headshot nobody could download.
		const file = await conferenceDeliverable(conferenceId, accountlessFileId);
		expect(file?.filename).toBe('headshot.png');
	});

	it('refuses a file from another conference', async () => {
		// The ownership check is replaced, not removed. This is the boundary that
		// replaces it, and it has to be exactly as sharp.
		expect(await conferenceDeliverable(conferenceId, foreignFileId)).toBeNull();
	});

	it('refuses another conference’s task and its file list', async () => {
		const [foreignTask] = await db
			.select({ id: taskTable.id })
			.from(taskTable)
			.where(eq(taskTable.conferenceId, otherConferenceId))
			.limit(1);

		expect(await conferenceTask(conferenceId, foreignTask.id)).toBeNull();
		expect(await conferenceTaskFiles(conferenceId, foreignTask.id)).toEqual([]);
	});
});

describe('the overview', () => {
	it('groups by speaker and counts what is waiting', async () => {
		const speakers = await contentOverview(conferenceId);
		expect(speakers.map((s) => s.name).sort()).toEqual(['Ada Bennett', 'Priya Raman']);

		const priya = speakers.find((s) => s.name === 'Priya Raman')!;
		expect(priya.tasks).toHaveLength(2);
		expect(priya.waiting).toBe(1);
		expect(priya.open).toBe(1);
		expect(priya.hasAccount).toBe(true);
	});

	it('says who cannot sign in, because chasing them means email', async () => {
		const ada = (await contentOverview(conferenceId)).find((s) => s.name === 'Ada Bennett')!;
		expect(ada.hasAccount).toBe(false);
	});

	it('shows the newest file per task, not the first', async () => {
		const priya = (await contentOverview(conferenceId)).find((s) => s.name === 'Priya Raman')!;
		const slides = priya.tasks.find((t) => t.title === 'Upload final slides')!;
		// Two versions exist; an organizer looking at a row wants the one that counts.
		expect(slides.fileCount).toBe(2);
		expect(slides.latestFilename).toBe('slides-v2.pdf');
	});

	it('does not count another conference’s tasks', async () => {
		const totals = await contentTotals(conferenceId);
		expect(totals.speakers).toBe(2);
		expect(totals.waiting).toBe(2);
		expect(totals.open).toBe(1);
	});
});

describe('deciding', () => {
	it('approves a file and finishes the task with it', async () => {
		const files = await conferenceTaskFiles(conferenceId, accountedTaskId);
		const latest = files[0];

		expect(await setDeliverableApproval(conferenceId, latest.id, 'approved')).toBe(true);

		const [task] = await db
			.select({ status: taskTable.status, completedAt: taskTable.completedAt })
			.from(taskTable)
			.where(eq(taskTable.id, accountedTaskId));
		// A file approved under a task still marked "handed in" would leave it on the
		// organizer's own chase list forever.
		expect(task.status).toBe('done');
		expect(task.completedAt).not.toBeNull();
	});

	it('reopens the task when changes are asked for', async () => {
		const files = await conferenceTaskFiles(conferenceId, accountedTaskId);

		expect(await setDeliverableApproval(conferenceId, files[0].id, 'rejected')).toBe(true);

		const [task] = await db
			.select({ status: taskTable.status, completedAt: taskTable.completedAt })
			.from(taskTable)
			.where(eq(taskTable.id, accountedTaskId));
		// Rejected but still "done" would tell the speaker they are finished and the
		// organizer that they are not.
		expect(task.status).toBe('open');
		expect(task.completedAt).toBeNull();
	});

	it('refuses to decide on another conference’s file', async () => {
		expect(await setDeliverableApproval(conferenceId, foreignFileId, 'approved')).toBe(false);
	});
});

describe('comments', () => {
	it('adds a note the speaker will read', async () => {
		const created = await addOrganizerComment(
			conferenceId,
			accountlessFileId,
			organizerId,
			'Can you send a version without the background?'
		);
		expect(created).not.toBeNull();

		const files = await conferenceTaskFiles(conferenceId, accountlessTaskId);
		expect(files[0].comments.map((c) => c.body)).toContain(
			'Can you send a version without the background?'
		);
		expect(files[0].comments[0].authorName).toBe('Jordan');
	});

	it('refuses a comment on another conference’s file', async () => {
		expect(await addOrganizerComment(conferenceId, foreignFileId, organizerId, 'Hi')).toBeNull();
	});

	it('ignores an empty note rather than storing a blank row', async () => {
		expect(
			await addOrganizerComment(conferenceId, accountlessFileId, organizerId, '  ')
		).toBeNull();
	});
});

describe('action tasks', () => {
	it('appears in the overview with no file expected', async () => {
		const priya = (await contentOverview(conferenceId)).find((s) => s.name === 'Priya Raman')!;
		const confirm = priya.tasks.find((t) => t.id === actionTaskId)!;
		expect(confirm.kind).toBe('action');
		expect(confirm.fileCount).toBe(0);
	});
});
