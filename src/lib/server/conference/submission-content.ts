/**
 * The organizer's own edit of a talk's title and abstract.
 *
 * Until now the only writer of these four fields was the speaker, through the CFP
 * form — and only while the call was open and the proposal still a draft. That is
 * right for the speaker and wrong for the organizer: a typo in the title of an
 * accepted talk is on the public programme, and "ask the speaker to fix it, but the
 * form they would use is closed" is not an answer.
 *
 * A separate module from `organizer-submissions` for the same reason `recordings` is:
 * that one is the reading side and says so in its header.
 *
 * Two rules live here rather than in the route, because the route is not the only
 * thing that could call this:
 *
 *  1. **The conference is in the WHERE clause.** An organizer of conference A must not
 *     reach conference B's talk by editing the URL.
 *  2. **An organizer does not delete the speaker's abstract.** The speaker's own form
 *     refuses to submit without one (`validateForSubmit`), so emptying it afterwards
 *     would produce a state the product says cannot exist — and it is the public
 *     programme that would show the hole. Narrowly a rule about *removing* text: a
 *     draft may be blank as CFP-07 allows, and a talk that already has none still
 *     takes a title fix rather than being held hostage to an unrelated gap.
 *
 * Every accepted edit writes a `content_revision` row holding the values as they were
 * BEFORE it. Someone rewriting another person's words without a trace is the part of
 * this feature that needs a receipt, not the writing itself.
 */
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { contentRevisionTable } from '$lib/server/db/conference/content-schema';
import { and, desc, eq } from 'drizzle-orm';

export type SubmissionContentInput = {
	title: string;
	abstract: string | null;
	keyTakeaway: string | null;
	audienceLevel: string | null;
};

export type EditContentResult =
	| { ok: true; changed: boolean }
	| { ok: false; reason: 'invalid'; errors: Record<string, string> }
	| { ok: false; reason: 'not_found' };

/** The fields this module owns, in the shape the revision snapshot stores them. */
function content(row: SubmissionContentInput): SubmissionContentInput {
	return {
		title: row.title,
		abstract: row.abstract,
		keyTakeaway: row.keyTakeaway,
		audienceLevel: row.audienceLevel
	};
}

function trimmed(value: string | null): string | null {
	const text = value?.trim() ?? '';
	return text || null;
}

/**
 * Rewrites the four content fields of one submission.
 *
 * Reads the current row and writes inside one transaction: the snapshot has to be of
 * the values this edit actually replaced, and two concurrent organizers on the same
 * screen would otherwise both record the same "before".
 */
export async function editSubmissionContent(
	conferenceId: number,
	submissionId: number,
	editorUserId: string,
	input: SubmissionContentInput
): Promise<EditContentResult> {
	const title = input.title.trim();
	const next = {
		title,
		abstract: trimmed(input.abstract),
		keyTakeaway: trimmed(input.keyTakeaway),
		audienceLevel: trimmed(input.audienceLevel)
	};

	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				title: submissionTable.title,
				abstract: submissionTable.abstract,
				keyTakeaway: submissionTable.keyTakeaway,
				audienceLevel: submissionTable.audienceLevel,
				status: submissionTable.status
			})
			.from(submissionTable)
			.where(
				and(eq(submissionTable.id, submissionId), eq(submissionTable.conferenceId, conferenceId))
			)
			.limit(1);

		if (!current) return { ok: false, reason: 'not_found' } as const;

		const errors: Record<string, string> = {};
		if (!title) errors.title = 'A title is required.';
		// Deleting the speaker's abstract, not merely lacking one: a talk that reached
		// `submitted` through the CFP form always had one, so an empty field there is an
		// edit that removes it. A talk that somehow has none already is not made worse by
		// a title fix, and refusing that would block the repair over an unrelated hole.
		if (!next.abstract && current.abstract && current.status !== 'draft') {
			errors.abstract = 'A submitted talk needs an abstract.';
		}
		if (Object.keys(errors).length > 0) {
			return { ok: false, reason: 'invalid', errors } as const;
		}

		const before = content(current);
		const unchanged =
			before.title === next.title &&
			before.abstract === next.abstract &&
			before.keyTakeaway === next.keyTakeaway &&
			before.audienceLevel === next.audienceLevel;
		// No write and no revision when nothing moved. A history of "saved again" rows
		// is a history nobody can read.
		if (unchanged) return { ok: true, changed: false } as const;

		await tx.insert(contentRevisionTable).values({
			entityType: 'submission',
			entityId: submissionId,
			snapshot: JSON.stringify(before),
			editedBy: editorUserId
		});

		await tx.update(submissionTable).set(next).where(eq(submissionTable.id, submissionId));

		return { ok: true, changed: true } as const;
	});
}

export type ContentEdit = {
	editedAt: Date;
	editorName: string | null;
};

/**
 * The most recent organizer edit, for the line that says so on the detail screen.
 *
 * A revision written and never shown is a record only a database client can find; the
 * speaker's talk was changed by someone else, and the screen should admit it.
 */
export async function lastContentEdit(submissionId: number): Promise<ContentEdit | null> {
	const [row] = await db
		.select({ editedAt: contentRevisionTable.editedAt, editorName: user.name })
		.from(contentRevisionTable)
		.leftJoin(user, eq(user.id, contentRevisionTable.editedBy))
		.where(
			and(
				eq(contentRevisionTable.entityType, 'submission'),
				eq(contentRevisionTable.entityId, submissionId)
			)
		)
		// `id` breaks the tie: two edits inside the same transaction timestamp are rare
		// but ordering them by chance would show the older one as the latest.
		.orderBy(desc(contentRevisionTable.editedAt), desc(contentRevisionTable.id))
		.limit(1);

	return row ?? null;
}
