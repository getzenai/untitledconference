/**
 * Deciding on submissions — and the internal work that decision sets off.
 *
 * This is Ü6 and Ü7 from ROLES_AND_JOURNEYS in one function. Notification is a
 * separate organizer action in `decision-notifications.ts`: deciding first and
 * telling speakers later is the workflow, not an implementation detail.
 *
 * All of it in one transaction. A half-accepted submission — status changed, no
 * session, no tasks — is worse than a failed click, because nothing on screen says
 * that half of it is missing.
 */
import { decisionBlockReason } from '$lib/conference/decision-summary';
import { taskDueDate } from '$lib/conference/task-due';
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable, taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { isConferenceOrganizer, type AcceptCondition } from './accept-condition';

export type Decision = 'accepted' | 'rejected' | 'waitlisted' | 'resubmit_with_guidance';

/**
 * The transaction handle, so the steps below can be separate functions without any
 * of them being able to escape the transaction the caller opened.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DecisionResult = {
	decided: number;
	/** Rows that already carried this decision, so nothing was written for them. */
	unchanged: number;
	/**
	 * Rows still in `draft` — the speaker never handed them in, so there is nothing
	 * to decide and they are left untouched. See the filter in `decideSubmissions`.
	 */
	skippedDrafts: number;
	/**
	 * Rows the speaker took back. Accepting one would put a withdrawn talk on the
	 * programme (#716). Same filter as drafts: the state, not the caller, decides.
	 */
	skippedWithdrawn: number;
	sessionsCreated: number;
	tasksCreated: number;
	/** Undone by taking an acceptance back — see `withdrawFromProgramme`. */
	sessionsRemoved: number;
	tasksRemoved: number;
};

const NOTHING_HAPPENED: DecisionResult = {
	decided: 0,
	unchanged: 0,
	skippedDrafts: 0,
	skippedWithdrawn: 0,
	sessionsCreated: 0,
	tasksCreated: 0,
	sessionsRemoved: 0,
	tasksRemoved: 0
};

/**
 * Applies one decision to one or many submissions.
 *
 * Bulk is the default rather than a feature: the organizer's journey (step 7) is a
 * screenful of rows at a time, and a loop of single-row calls would each open their
 * own transaction — the failure mode being half the screen decided and half not.
 */
export async function decideSubmissions(
	conference: Conference,
	submissionIds: number[],
	decision: Decision,
	condition: AcceptCondition | null = null,
	/**
	 * The sentence on a decline-path outcome (#447). Guidance on
	 * `resubmit_with_guidance` (required); the champion's optional line on
	 * a decline. Ignored on accept and waitlist.
	 */
	sentence: string | null = null
): Promise<DecisionResult> {
	const result: DecisionResult = { ...NOTHING_HAPPENED };
	if (submissionIds.length === 0) return result;

	const note = await acceptedNote(conference, decision, condition);
	const attached = attachedSentence(decision, sentence);

	await db.transaction(async (tx) => {
		const selected = await tx
			.select({
				id: submissionTable.id,
				title: submissionTable.title,
				status: submissionTable.status
			})
			.from(submissionTable)
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					inArray(submissionTable.id, submissionIds)
				)
			);

		// A draft was never handed in — it is the speaker's private, unfinished form,
		// and the organizer screens only ever offer submitted work. Deciding one
		// produced a state the UI cannot: `status: accepted` with `submittedAt: null`,
		// the talk sitting in the agenda tray and its speakers confirmed, all without
		// the speaker ever pressing submit (#321). Withdrawn is the other terminal
		// the speaker owns: they took it back, and accepting it would put it on the
		// programme (#716). The screen reached this function with ids it had listed
		// itself, so only a rebuilt form or the MCP surface could get here — but
		// the rule belongs to the state, not to one caller of it.
		const decidable = selected.filter((s) => decisionBlockReason(s.status) === null);
		result.skippedDrafts = selected.filter((s) => s.status === 'draft').length;
		result.skippedWithdrawn = selected.filter((s) => s.status === 'withdrawn').length;

		// A row that already carries this decision is left alone entirely. The
		// separate notification action is idempotent in its own right; a second click
		// here must not recreate agenda or task work either.
		const targets = decidable.filter((s) => s.status !== decision);
		result.unchanged = decidable.length - targets.length;
		if (targets.length === 0) return;

		const ids = targets.map((t) => t.id);
		const now = new Date();

		await recordDecision(tx, ids, decision, note, attached);
		result.decided = ids.length;

		const speakers = await speakersOn(tx, ids);

		if (decision === 'accepted') {
			result.sessionsCreated = await putInAgendaTray(tx, conference, ids);
			await confirmSpeakers(tx, conference, speakers);
			result.tasksCreated = await createSpeakerTasks(tx, conference, speakers, ids, now);
		} else {
			const undone = await withdrawFromProgramme(tx, ids);
			result.sessionsRemoved = undone.sessions;
			result.tasksRemoved = undone.tasks;
		}
	});

	return result;
}

/**
 * A condition on a decline is leftover form state. A condition whose owner
 * cannot open the chase board would write a note nobody can resolve, so the
 * accept itself does not go through.
 */
async function acceptedNote(
	conference: Conference,
	decision: Decision,
	condition: AcceptCondition | null
): Promise<AcceptCondition | null> {
	const note = decision === 'accepted' ? condition : null;
	if (note && !(await isConferenceOrganizer(conference, note.ownerId))) {
		throw new Error('invalid_condition_owner');
	}
	return note;
}

/**
 * Guidance is the outcome; without it we would be writing a decline under
 * another name. A decline may carry a sentence or not.
 */
function attachedSentence(decision: Decision, sentence: string | null): string | null {
	if (decision === 'resubmit_with_guidance') {
		const text = sentence?.trim() ?? '';
		if (!text) throw new Error('missing_guidance');
		return text;
	}
	if (decision === 'rejected') return sentence?.trim() || null;
	return null;
}

/**
 * Use the database wall clock so this decision boundary is strictly after any
 * notification row committed by an earlier organizer action. A JS Date only
 * has millisecond precision and can otherwise make two rapid actions appear
 * simultaneous to Postgres.
 *
 * A clean accept writes null; any other decision drops a leftover note.
 * The talk is accepted either way — the note is not a second status, and it
 * must not survive a decision that is no longer an accept (#445).
 *
 * The same is true of the two decline-path sentences (#447): guidance lives
 * only on `resubmit_with_guidance`, the champion line only on a decline.
 */
async function recordDecision(
	tx: Tx,
	ids: number[],
	decision: Decision,
	note: AcceptCondition | null,
	sentence: string | null
) {
	await tx
		.update(submissionTable)
		.set({
			status: decision,
			decidedAt: sql`clock_timestamp()`,
			acceptCondition: note?.text ?? null,
			acceptConditionOwnerId: note?.ownerId ?? null,
			resubmitGuidance: decision === 'resubmit_with_guidance' ? sentence : null,
			declineNote: decision === 'rejected' ? sentence : null
		})
		.where(inArray(submissionTable.id, ids));
}

/** Every speaker on the given submissions, with the address the decision mail goes to. */
async function speakersOn(tx: Tx, submissionIds: number[]) {
	return tx
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			speakerProfileId: speakerProfileTable.id,
			email: speakerProfileTable.email
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, submissionIds));
}

type SpeakerOnSubmission = Awaited<ReturnType<typeof speakersOn>>[number];

/**
 * Ü6 — the accepted talk becomes a planable session, parked in the tray: tentative,
 * no day, no room. `tentative` is what makes it draggable without it appearing on
 * the public programme (see program-schema).
 */
async function putInAgendaTray(tx: Tx, conference: Conference, ids: number[]): Promise<number> {
	const placed = new Set(
		(
			await tx
				.select({ submissionId: placementTable.submissionId })
				.from(placementTable)
				.where(inArray(placementTable.submissionId, ids))
		).map((p) => p.submissionId)
	);

	const fresh = ids
		.filter((id) => !placed.has(id))
		.map((submissionId) => ({
			conferenceId: conference.id,
			kind: 'session' as const,
			status: 'tentative' as const,
			submissionId
		}));

	if (fresh.length === 0) return 0;
	await tx.insert(placementTable).values(fresh);
	return fresh.length;
}

/**
 * Taking an acceptance back has to undo what accepting did — otherwise a declined
 * talk keeps sitting in the agenda tray as a planable session and the speaker keeps
 * a portal full of tasks for a talk that is not happening.
 *
 * Two things are deliberately NOT undone:
 *
 * - a **confirmed** placement. That is a slot an organizer picked by hand and may
 *   have told people about; a bulk click on Decline must not silently empty the
 *   grid. It stays, visibly wrong, for a human to resolve.
 * - a task the speaker has already **touched** (submitted or done). Deleting it
 *   would take their uploaded slides with it.
 */
async function withdrawFromProgramme(tx: Tx, ids: number[]) {
	const sessions = await tx
		.delete(placementTable)
		.where(and(inArray(placementTable.submissionId, ids), eq(placementTable.status, 'tentative')))
		.returning({ id: placementTable.id });

	const tasks = await tx
		.delete(taskTable)
		.where(
			and(
				inArray(taskTable.submissionId, ids),
				eq(taskTable.status, 'open'),
				// Only the ones acceptance generated. A task an organizer typed by hand
				// for this talk is theirs to withdraw, not ours.
				isNotNull(taskTable.templateId)
			)
		)
		.returning({ id: taskTable.id });

	return { sessions: sessions.length, tasks: tasks.length };
}

/**
 * The speaker joins the event. Confirming an already-declined speaker would overwrite
 * their own answer, so an existing row is left exactly as it is.
 */
async function confirmSpeakers(tx: Tx, conference: Conference, speakers: SpeakerOnSubmission[]) {
	for (const speaker of dedupeSpeakers(speakers)) {
		await tx
			.insert(conferenceSpeakerTable)
			.values({
				conferenceId: conference.id,
				speakerProfileId: speaker.speakerProfileId,
				status: 'confirmed'
			})
			.onConflictDoNothing();
	}
}

/** Ü7 — the portal fills itself from the conference's task template. */
async function createSpeakerTasks(
	tx: Tx,
	conference: Conference,
	speakers: SpeakerOnSubmission[],
	ids: number[],
	now: Date
): Promise<number> {
	const templates = await tx
		.select()
		.from(taskTemplateTable)
		.where(eq(taskTemplateTable.conferenceId, conference.id));
	if (templates.length === 0) return 0;

	// Accepting the same talk twice must not hand the speaker the same task twice.
	const existing = new Set(
		(
			await tx
				.select({
					submissionId: taskTable.submissionId,
					templateId: taskTable.templateId,
					speakerProfileId: taskTable.speakerProfileId
				})
				.from(taskTable)
				.where(inArray(taskTable.submissionId, ids))
		).map((t) => `${t.submissionId}:${t.templateId}:${t.speakerProfileId}`)
	);

	const tasks = speakers.flatMap((speaker) =>
		templates
			.filter((template) => {
				const key = `${speaker.submissionId}:${template.id}:${speaker.speakerProfileId}`;
				if (existing.has(key)) return false;
				existing.add(key);
				return true;
			})
			.map((template) => ({
				conferenceId: conference.id,
				speakerProfileId: speaker.speakerProfileId,
				submissionId: speaker.submissionId,
				templateId: template.id,
				title: template.title,
				instructions: template.instructions,
				kind: template.kind,
				dueOn: taskDueDate(template.dueOn, template.dueOffsetDays, now)
			}))
	);

	if (tasks.length === 0) return 0;
	await tx.insert(taskTable).values(tasks);
	return tasks.length;
}

/** One row per speaker profile, however many of the accepted talks they are on. */
function dedupeSpeakers<T extends { speakerProfileId: number }>(speakers: T[]): T[] {
	const seen = new Map<number, T>();
	for (const s of speakers) if (!seen.has(s.speakerProfileId)) seen.set(s.speakerProfileId, s);
	return [...seen.values()];
}
