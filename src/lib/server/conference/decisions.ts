/**
 * Deciding on submissions — and everything that decision is supposed to set off.
 *
 * This is Ü5, Ü6 and Ü7 from ROLES_AND_JOURNEYS in one function, and it is the most
 * expensive handoff in the product: if accepting a talk does not by itself make it a
 * planable session, produce the speaker's tasks and record the mail, then somebody
 * types the whole conference in a second time.
 *
 * All of it in one transaction. A half-accepted submission — status changed, no
 * session, no tasks — is worse than a failed click, because nothing on screen says
 * that half of it is missing.
 */
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceSpeakerTable,
	speakerProfileTable,
	type Conference
} from '$lib/server/db/conference/conference-schema';
import { taskTable, taskTemplateTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, eq, inArray } from 'drizzle-orm';

export type Decision = 'accepted' | 'rejected' | 'waitlisted';

export type DecisionResult = {
	decided: number;
	sessionsCreated: number;
	tasksCreated: number;
	emailsQueued: number;
};

const EMAIL_TEMPLATE: Record<Decision, string> = {
	accepted: 'decision_accepted',
	rejected: 'decision_rejected',
	waitlisted: 'decision_waitlisted'
};

function subjectFor(decision: Decision, conference: Conference): string {
	if (decision === 'accepted') return `Your ${conference.name} submission was accepted`;
	if (decision === 'waitlisted') return `Your ${conference.name} submission is on the waitlist`;
	return `About your ${conference.name} submission`;
}

function bodyFor(decision: Decision, conference: Conference, title: string): string {
	if (decision === 'accepted') {
		return `“${title}” is in the programme for ${conference.name}. Your speaker portal now lists what we need from you and when.`;
	}
	if (decision === 'waitlisted') {
		return `“${title}” is on the waitlist for ${conference.name}. We will be in touch if a slot opens up.`;
	}
	return `We are not able to fit “${title}” into ${conference.name} this time. Thank you for submitting.`;
}

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
	decision: Decision
): Promise<DecisionResult> {
	const result: DecisionResult = {
		decided: 0,
		sessionsCreated: 0,
		tasksCreated: 0,
		emailsQueued: 0
	};

	if (submissionIds.length === 0) return result;

	await db.transaction(async (tx) => {
		const targets = await tx
			.select({ id: submissionTable.id, title: submissionTable.title })
			.from(submissionTable)
			.where(
				and(
					eq(submissionTable.conferenceId, conference.id),
					inArray(submissionTable.id, submissionIds)
				)
			);

		if (targets.length === 0) return;
		const ids = targets.map((t) => t.id);
		const now = new Date();

		await tx
			.update(submissionTable)
			.set({ status: decision, decidedAt: now })
			.where(inArray(submissionTable.id, ids));
		result.decided = ids.length;

		const speakers = await tx
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
			.where(inArray(submissionSpeakerTable.submissionId, ids));

		if (decision === 'accepted') {
			// Ü6 — the talk becomes a planable session, parked in the tray: tentative,
			// no day, no room. `tentative` is what makes it draggable without it
			// appearing on the public programme (see program-schema).
			const alreadyPlaced = new Set(
				(
					await tx
						.select({ submissionId: placementTable.submissionId })
						.from(placementTable)
						.where(inArray(placementTable.submissionId, ids))
				).map((p) => p.submissionId)
			);

			const newPlacements = ids
				.filter((id) => !alreadyPlaced.has(id))
				.map((submissionId) => ({
					conferenceId: conference.id,
					kind: 'session' as const,
					status: 'tentative' as const,
					submissionId
				}));

			if (newPlacements.length > 0) {
				await tx.insert(placementTable).values(newPlacements);
				result.sessionsCreated = newPlacements.length;
			}

			// The speaker joins the event. Confirming an already-declined speaker would
			// overwrite their answer, so only the invitation state is moved forward.
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

			// Ü7 — the portal fills itself from the conference's task template.
			const templates = await tx
				.select()
				.from(taskTemplateTable)
				.where(eq(taskTemplateTable.conferenceId, conference.id));

			if (templates.length > 0) {
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

				const tasks = [];
				for (const speaker of speakers) {
					for (const template of templates) {
						const key = `${speaker.submissionId}:${template.id}:${speaker.speakerProfileId}`;
						if (existing.has(key)) continue;
						existing.add(key);
						tasks.push({
							conferenceId: conference.id,
							speakerProfileId: speaker.speakerProfileId,
							submissionId: speaker.submissionId,
							templateId: template.id,
							title: template.title,
							instructions: template.instructions,
							kind: template.kind,
							dueOn: dueDate(template.dueOn, template.dueOffsetDays, now)
						});
					}
				}

				if (tasks.length > 0) {
					await tx.insert(taskTable).values(tasks);
					result.tasksCreated = tasks.length;
				}
			}
		}

		// Ü5 — the decision reaches the submitter as mail, not only as a status they
		// would have to go looking for. The row IS the evidence; sending is the
		// worker's job (see email-schema).
		const titles = new Map(targets.map((t) => [t.id, t.title]));
		const mails = speakers
			.filter((s) => s.email)
			.map((s) => ({
				conferenceId: conference.id,
				toEmail: s.email!,
				template: EMAIL_TEMPLATE[decision],
				subject: subjectFor(decision, conference),
				bodyPreview: bodyFor(decision, conference, titles.get(s.submissionId) ?? ''),
				status: 'queued' as const,
				relatedType: 'submission',
				relatedId: s.submissionId
			}));

		if (mails.length > 0) {
			await tx.insert(emailLogTable).values(mails);
			result.emailsQueued = mails.length;
		}
	});

	return result;
}

/** One row per speaker profile, however many of the accepted talks they are on. */
function dedupeSpeakers<T extends { speakerProfileId: number }>(speakers: T[]): T[] {
	const seen = new Map<number, T>();
	for (const s of speakers) if (!seen.has(s.speakerProfileId)) seen.set(s.speakerProfileId, s);
	return [...seen.values()];
}

/** Absolute date wins over the offset; the offset counts from the acceptance. */
function dueDate(dueOn: Date | null, offsetDays: number | null, from: Date): Date | null {
	if (dueOn) return dueOn;
	if (offsetDays === null) return null;
	const due = new Date(from);
	due.setDate(due.getDate() + offsetDays);
	return due;
}
