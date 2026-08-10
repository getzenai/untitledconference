/**
 * A speaker's tasks, and the files they hand in against them.
 *
 * Every function here is anchored on `speaker_profile.userId = <signed-in user>`
 * inside the query, never as a check afterwards. That matters most on the
 * download route: a deliverable is an unreleased slide deck or someone's
 * headshot, and "is this person logged in" is not the question — "is this their
 * task" is. Being signed in as anybody would otherwise be enough.
 *
 * Versions are rows (CNT-04). A re-upload never overwrites: it inserts
 * `max(version) + 1`, the newest is the latest, and every earlier one stays
 * reachable. An overwrite would destroy the thing the criterion asks to see.
 */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import {
	deliverableTable,
	fileCommentTable,
	taskTable
} from '$lib/server/db/conference/content-schema';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';

/** One task of this user's, with the conference it belongs to. Null if not theirs. */
export async function ownTask(userId: string, taskId: number) {
	const [row] = await db
		.select({
			id: taskTable.id,
			conferenceId: taskTable.conferenceId,
			conferenceSlug: conferenceTable.slug,
			conferenceName: conferenceTable.name,
			speakerProfileId: taskTable.speakerProfileId,
			title: taskTable.title,
			instructions: taskTable.instructions,
			kind: taskTable.kind,
			status: taskTable.status,
			dueOn: taskTable.dueOn,
			submissionTitle: submissionTable.title
		})
		.from(taskTable)
		.innerJoin(conferenceTable, eq(conferenceTable.id, taskTable.conferenceId))
		.innerJoin(speakerProfileTable, eq(speakerProfileTable.id, taskTable.speakerProfileId))
		.leftJoin(submissionTable, eq(submissionTable.id, taskTable.submissionId))
		.where(and(eq(taskTable.id, taskId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	return row ?? null;
}

export type TaskFile = {
	id: number;
	filename: string;
	contentType: string | null;
	sizeBytes: number | null;
	version: number;
	approvalStatus: string;
	uploadedAt: Date;
	comments: { id: number; body: string; authorName: string | null; createdAt: Date }[];
};

/**
 * Every version handed in against a task, newest first, each with its comments.
 *
 * Comments are loaded per deliverable rather than joined, because a file with
 * three comments would otherwise appear three times and the caller would have to
 * undo that — the same shape of bug as multiplying rows under a LIMIT.
 */
export async function taskFiles(taskId: number): Promise<TaskFile[]> {
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
		.where(eq(deliverableTable.taskId, taskId))
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

	const byDeliverable = new Map<number, TaskFile['comments']>();
	for (const c of comments) {
		byDeliverable.set(c.deliverableId, [
			...(byDeliverable.get(c.deliverableId) ?? []),
			{ id: c.id, body: c.body, authorName: c.authorName, createdAt: c.createdAt }
		]);
	}

	return files.map((f) => ({ ...f, comments: byDeliverable.get(f.id) ?? [] }));
}

/** The version a new upload takes. Rows, not overwrites (CNT-04). */
export async function nextVersion(taskId: number): Promise<number> {
	const [row] = await db
		.select({ highest: max(deliverableTable.version) })
		.from(deliverableTable)
		.where(eq(deliverableTable.taskId, taskId));
	return (row?.highest ?? 0) + 1;
}

/**
 * Records an uploaded file and marks its task as handed in.
 *
 * The status move is part of the same transaction as the row: a deliverable
 * whose task still says "open" would send the organizer chasing something they
 * already have.
 */
export async function recordDeliverable(input: {
	taskId: number;
	userId: string;
	fileUrl: string;
	filename: string;
	contentType: string | null;
	sizeBytes: number;
	version: number;
}): Promise<number> {
	return db.transaction(async (tx) => {
		// The same task-row lock the organizer's decision path takes, in the same
		// position: first statement, before anything is read or written. One lock, one
		// order, so the two paths serialise and cannot deadlock.
		//
		// Taking it here is deliberately belt-and-braces, and honestly so: the `UPDATE`
		// below already locks this row, and it runs after the insert, so today the
		// decision path's lock alone is what makes the pair safe — removing this line
		// leaves the race test green. It is here so the protocol is stated rather than
		// implied. Reorder or drop that `UPDATE` and this becomes the only thing
		// holding the ordering up.
		await tx
			.select({ id: taskTable.id })
			.from(taskTable)
			.where(eq(taskTable.id, input.taskId))
			.for('update');

		const [created] = await tx
			.insert(deliverableTable)
			.values({
				taskId: input.taskId,
				fileUrl: input.fileUrl,
				filename: input.filename,
				contentType: input.contentType,
				sizeBytes: input.sizeBytes,
				version: input.version,
				uploadedBy: input.userId
			})
			.returning({ id: deliverableTable.id });

		await tx.update(taskTable).set({ status: 'submitted' }).where(eq(taskTable.id, input.taskId));

		return created.id;
	});
}

/** One deliverable, only if the signed-in user is the speaker it belongs to. */
export async function ownDeliverable(userId: string, deliverableId: number) {
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
		.innerJoin(speakerProfileTable, eq(speakerProfileTable.id, taskTable.speakerProfileId))
		.where(and(eq(deliverableTable.id, deliverableId), eq(speakerProfileTable.userId, userId)))
		.limit(1);

	return row ?? null;
}

/**
 * A comment on a file, visible across roles (CNT-05).
 *
 * Distinct from `review.comment`, which a speaker must never see. This one is a
 * conversation about a deliverable and both sides are meant to read it.
 */
export async function addFileComment(userId: string, deliverableId: number, body: string) {
	const trimmed = body.trim();
	if (!trimmed) return null;

	const owned = await ownDeliverable(userId, deliverableId);
	if (!owned) return null;

	const [created] = await db
		.insert(fileCommentTable)
		.values({ deliverableId, authorUserId: userId, body: trimmed })
		.returning({ id: fileCommentTable.id });

	return created.id;
}

/**
 * Marks an action task done, or reopens it.
 *
 * Only tasks with no file attached: a `file_request` is finished by handing the
 * file in, and letting it be ticked off without one would make the status say
 * something the deliverable list contradicts.
 */
export async function setActionTaskDone(
	userId: string,
	taskId: number,
	done: boolean
): Promise<boolean> {
	const task = await ownTask(userId, taskId);
	if (!task || task.kind !== 'action') return false;

	await db
		.update(taskTable)
		.set({ status: done ? 'done' : 'open', completedAt: done ? new Date() : null })
		.where(eq(taskTable.id, taskId));

	return true;
}
