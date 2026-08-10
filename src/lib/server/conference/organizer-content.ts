/**
 * The organizer's side of speaker tasks and the files handed in against them.
 *
 * The speaker portal answers "is this your task"; every query there is anchored on
 * `speaker_profile.user_id`. This module answers a different question — "is this file
 * part of the conference you organise" — and that difference is the point rather than
 * a detail:
 *
 * A speaker profile created by an organizer has no `user_id` at all. On the demo tenant
 * Ada Bennett has an uploaded headshot that literally nobody can download, because the
 * only route to it re-checks an ownership that does not exist. Chasing a missing
 * headshot is an organizer's job, so the organizer needs a way in that does not borrow
 * the speaker's identity.
 *
 * Scoping therefore runs conference → task → deliverable in the WHERE clause, the same
 * shape as the portal's ownership check and with the same rule: it is in the query, not
 * in the caller.
 */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import {
	deliverableTable,
	fileCommentTable,
	taskTable
} from '$lib/server/db/conference/content-schema';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

export type ContentTask = {
	id: number;
	title: string;
	kind: string;
	status: string;
	dueOn: Date | null;
	fileCount: number;
	latestFilename: string | null;
	latestApproval: string | null;
};

export type ContentSpeaker = {
	speakerProfileId: number;
	name: string;
	email: string | null;
	hasAccount: boolean;
	tasks: ContentTask[];
	open: number;
	waiting: number;
	done: number;
};

/**
 * Everyone with a task, and where each of their tasks stands.
 *
 * Grouped by speaker rather than listed by task, because the organizer's actual
 * question is "who do I chase", and a flat task list makes them do the grouping in
 * their head.
 */
function selectTasks(conferenceId: number) {
	return db
		.select({
			id: taskTable.id,
			title: taskTable.title,
			kind: taskTable.kind,
			status: taskTable.status,
			dueOn: taskTable.dueOn,
			speakerProfileId: speakerProfileTable.id,
			speakerName: speakerProfileTable.name,
			speakerEmail: speakerProfileTable.email,
			speakerUserId: speakerProfileTable.userId
		})
		.from(taskTable)
		.innerJoin(speakerProfileTable, eq(speakerProfileTable.id, taskTable.speakerProfileId))
		.where(eq(taskTable.conferenceId, conferenceId))
		.orderBy(asc(speakerProfileTable.sortName), asc(taskTable.id));
}

export async function contentOverview(conferenceId: number): Promise<ContentSpeaker[]> {
	const tasks = await selectTasks(conferenceId);
	const files = await filesByTask(tasks.map((t) => t.id));

	const speakers = new Map<number, ContentSpeaker>();
	for (const t of tasks) {
		const entry = speakers.get(t.speakerProfileId) ?? emptySpeaker(t);
		entry.tasks.push(toTask(t, files.get(t.id)));
		countTowards(entry, t.status);
		speakers.set(t.speakerProfileId, entry);
	}

	return [...speakers.values()];
}

type TaskRow = Awaited<ReturnType<typeof selectTasks>>[number];

function emptySpeaker(t: TaskRow): ContentSpeaker {
	return {
		speakerProfileId: t.speakerProfileId,
		name: t.speakerName,
		email: t.speakerEmail,
		// Recorded rather than inferred at the call site: a speaker with no account
		// cannot act on any of this, so the page has to say so instead of quietly
		// listing tasks that will never be ticked off.
		hasAccount: t.speakerUserId !== null,
		tasks: [],
		open: 0,
		waiting: 0,
		done: 0
	};
}

function toTask(t: TaskRow, summary: FileSummary | undefined): ContentTask {
	return {
		id: t.id,
		title: t.title,
		kind: t.kind,
		status: t.status,
		dueOn: t.dueOn,
		fileCount: summary?.count ?? 0,
		latestFilename: summary?.filename ?? null,
		latestApproval: summary?.approval ?? null
	};
}

function countTowards(entry: ContentSpeaker, status: string) {
	if (status === 'open') entry.open += 1;
	else if (status === 'submitted') entry.waiting += 1;
	else entry.done += 1;
}

type FileSummary = { count: number; filename: string; approval: string };

/** The newest file per task, and how many there are. */
async function filesByTask(taskIds: number[]): Promise<Map<number, FileSummary>> {
	const summary = new Map<number, FileSummary>();
	if (taskIds.length === 0) return summary;

	const rows = await db
		.select({
			taskId: deliverableTable.taskId,
			filename: deliverableTable.filename,
			approval: deliverableTable.approvalStatus,
			version: deliverableTable.version
		})
		.from(deliverableTable)
		.where(inArray(deliverableTable.taskId, taskIds))
		.orderBy(asc(deliverableTable.taskId), desc(deliverableTable.version));

	for (const r of rows) {
		const existing = summary.get(r.taskId);
		// Rows arrive newest-version first, so the first one seen for a task is the
		// latest; later ones only add to the count.
		if (existing) existing.count += 1;
		else summary.set(r.taskId, { count: 1, filename: r.filename, approval: r.approval });
	}

	return summary;
}

/** One task of this conference's, with its files and their comments. */
export async function conferenceTask(conferenceId: number, taskId: number) {
	const [task] = await db
		.select({
			id: taskTable.id,
			conferenceId: taskTable.conferenceId,
			title: taskTable.title,
			instructions: taskTable.instructions,
			kind: taskTable.kind,
			status: taskTable.status,
			dueOn: taskTable.dueOn,
			speakerName: speakerProfileTable.name,
			speakerEmail: speakerProfileTable.email,
			speakerHasAccount: sql<boolean>`${speakerProfileTable.userId} is not null`
		})
		.from(taskTable)
		.innerJoin(speakerProfileTable, eq(speakerProfileTable.id, taskTable.speakerProfileId))
		.where(and(eq(taskTable.id, taskId), eq(taskTable.conferenceId, conferenceId)))
		.limit(1);

	return task ?? null;
}

export type ConferenceFile = {
	id: number;
	filename: string;
	contentType: string | null;
	sizeBytes: number | null;
	version: number;
	approvalStatus: string;
	uploadedAt: Date;
	comments: { id: number; body: string; authorName: string | null; createdAt: Date }[];
};

export async function conferenceTaskFiles(
	conferenceId: number,
	taskId: number
): Promise<ConferenceFile[]> {
	const files = await db
		.select({
			id: deliverableTable.id,
			filename: deliverableTable.filename,
			contentType: deliverableTable.contentType,
			sizeBytes: deliverableTable.sizeBytes,
			version: deliverableTable.version,
			approvalStatus: deliverableTable.approvalStatus,
			uploadedAt: deliverableTable.uploadedAt
		})
		.from(deliverableTable)
		.innerJoin(taskTable, eq(taskTable.id, deliverableTable.taskId))
		.where(and(eq(taskTable.id, taskId), eq(taskTable.conferenceId, conferenceId)))
		.orderBy(desc(deliverableTable.version));

	if (files.length === 0) return [];

	const comments = await db
		.select({
			id: fileCommentTable.id,
			deliverableId: fileCommentTable.deliverableId,
			body: fileCommentTable.body,
			authorName: user.name,
			createdAt: fileCommentTable.createdAt
		})
		.from(fileCommentTable)
		.innerJoin(user, eq(user.id, fileCommentTable.authorUserId))
		.where(
			inArray(
				fileCommentTable.deliverableId,
				files.map((f) => f.id)
			)
		)
		.orderBy(asc(fileCommentTable.createdAt));

	return files.map((f) => ({
		...f,
		comments: comments
			.filter((c) => c.deliverableId === f.id)
			.map(({ id, body, authorName, createdAt }) => ({ id, body, authorName, createdAt }))
	}));
}

/**
 * One deliverable, scoped to the conference rather than to a speaker's account.
 *
 * This is the query that lets an organizer download a file belonging to a speaker who
 * has no login. It is not a weaker check than the portal's — it is a different one, and
 * the caller has already had to pass `requireOrganizer` to reach it.
 */
export async function conferenceDeliverable(conferenceId: number, deliverableId: number) {
	const [row] = await db
		.select({
			id: deliverableTable.id,
			taskId: deliverableTable.taskId,
			fileUrl: deliverableTable.fileUrl,
			filename: deliverableTable.filename,
			contentType: deliverableTable.contentType
		})
		.from(deliverableTable)
		.innerJoin(taskTable, eq(taskTable.id, deliverableTable.taskId))
		.where(and(eq(deliverableTable.id, deliverableId), eq(taskTable.conferenceId, conferenceId)))
		.limit(1);

	return row ?? null;
}

/**
 * Approves or rejects a handed-in file, and moves the task with it.
 *
 * The two move together on purpose. A rejected file that leaves its task on "handed in"
 * tells the speaker they are finished and the organizer that they are not — the same
 * class of disagreement as a deliverable under a task still marked open.
 */
export async function setDeliverableApproval(
	conferenceId: number,
	deliverableId: number,
	approval: 'approved' | 'rejected' | 'pending'
): Promise<boolean> {
	const file = await conferenceDeliverable(conferenceId, deliverableId);
	if (!file) return false;

	await db.transaction(async (tx) => {
		// Lock the task row FIRST, before reading anything about its versions.
		//
		// Deriving from the newest version is only correct if nothing can add a newer
		// one between the read and the write. It could: a speaker uploading at the same
		// moment commits a new version and sets the task to `submitted`, and this
		// transaction then wrote its stale conclusion over the top. Found in review with
		// a deterministic repro, not in theory.
		//
		// `recordDeliverable` takes this same lock, in the same place, so the two
		// serialise: whichever gets it first finishes, and the second one reads the
		// world the first one left behind. One lock taken in one order also means there
		// is no deadlock window between them.
		await tx
			.select({ id: taskTable.id })
			.from(taskTable)
			.where(eq(taskTable.id, file.taskId))
			.for('update');

		await tx
			.update(deliverableTable)
			.set({ approvalStatus: approval })
			.where(eq(deliverableTable.id, deliverableId));

		// The task follows the NEWEST version, not the one that was just clicked.
		//
		// Deriving it from the clicked file was wrong in a way the screen made easy to
		// hit: every version carries its own decision form, so approving v2 and then
		// rejecting v1 left the task `open` while the current file said `approved` —
		// the exact disagreement this function exists to prevent. Re-reading the
		// newest row inside the transaction makes the invariant true by construction,
		// whichever version the organizer decided on.
		const [newest] = await tx
			.select({ approvalStatus: deliverableTable.approvalStatus })
			.from(deliverableTable)
			.where(eq(deliverableTable.taskId, file.taskId))
			.orderBy(desc(deliverableTable.version))
			.limit(1);

		const current = newest?.approvalStatus ?? approval;
		const status = current === 'approved' ? 'done' : current === 'rejected' ? 'open' : 'submitted';
		await tx
			.update(taskTable)
			.set({ status, completedAt: current === 'approved' ? new Date() : null })
			.where(eq(taskTable.id, file.taskId));
	});

	return true;
}

/**
 * A comment from the organizer's side of the same thread the speaker reads.
 *
 * Distinct from `review.comment`, which a speaker must never see. This one is the
 * conversation about a file and both sides are meant to read it — which is why
 * rejecting without saying why is possible but unhelpful, and the form asks.
 */
export async function addOrganizerComment(
	conferenceId: number,
	deliverableId: number,
	authorUserId: string,
	body: string
): Promise<number | null> {
	const trimmed = body.trim();
	if (!trimmed) return null;

	const file = await conferenceDeliverable(conferenceId, deliverableId);
	if (!file) return null;

	const [created] = await db
		.insert(fileCommentTable)
		.values({ deliverableId, authorUserId, body: trimmed })
		.returning({ id: fileCommentTable.id });

	return created.id;
}

export type ContentTotals = {
	speakers: number;
	open: number;
	waiting: number;
	done: number;
	overdue: number;
};

/** The counts behind the page's one-line summary. */
export async function contentTotals(conferenceId: number): Promise<ContentTotals> {
	const [row] = await db
		.select({
			speakers: sql<number>`count(distinct ${taskTable.speakerProfileId})::int`,
			open: sql<number>`count(*) filter (where ${taskTable.status} = 'open')::int`,
			waiting: sql<number>`count(*) filter (where ${taskTable.status} = 'submitted')::int`,
			done: sql<number>`count(*) filter (where ${taskTable.status} = 'done')::int`,
			overdue: sql<number>`count(*) filter (where ${taskTable.status} <> 'done' and ${taskTable.dueOn} < now())::int`
		})
		.from(taskTable)
		.where(eq(taskTable.conferenceId, conferenceId));

	return row ?? { speakers: 0, open: 0, waiting: 0, done: 0, overdue: 0 };
}

/** Kept for the callers that only need a number. */
export async function taskCount(conferenceId: number): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(taskTable)
		.where(eq(taskTable.conferenceId, conferenceId));
	return row?.n ?? 0;
}
