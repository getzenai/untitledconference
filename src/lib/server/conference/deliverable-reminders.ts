/**
 * Chasing speakers who still owe a deliverable (CNT-08).
 *
 * The demo tenant has carried `task_reminder` rows in `email_log` since the seed was
 * written, which made the log look like a feature — but no screen could produce one.
 * This is the button behind those rows.
 *
 * Two rules differ from the reviewer reminder next door in `review-management.ts`, and
 * the difference is deliberate:
 *
 * - **Outstanding means `open`, not "not done".** A speaker whose file is in and is
 *   waiting on the organizer's approval (`submitted`) is not behind on anything; mailing
 *   them would be the product blaming them for the organizer's queue.
 * - **A sent reminder does not block the next one.** Review reminders are a one-off
 *   nudge before a deadline, so a successful row suppresses a repeat forever. Deliverables
 *   are chased weekly until the file arrives, so only a reminder still sitting `queued`
 *   suppresses another — that stops a double-click from stacking two identical unsent
 *   emails, without making the second week's chase impossible.
 *
 * Scoped conference → task → speaker in the WHERE clause, like `organizer-content.ts`:
 * a speaker profile id arriving from a form is never trusted on its own.
 */
import { db } from '$lib/server/db';
import type { Conference } from '$lib/server/db/conference/conference-schema';
import { speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { taskTable } from '$lib/server/db/conference/content-schema';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { and, count, eq } from 'drizzle-orm';
import { dispatchConferenceEmails } from './email-dispatcher';

export type DeliverableReminderResult =
	| 'queued'
	| 'already_queued'
	| 'nothing_outstanding'
	| 'no_email';

export type DeliverableReminderTally = Record<DeliverableReminderResult, number>;

async function queueDeliverableReminderRow(
	conference: Conference,
	speakerProfileId: number
): Promise<DeliverableReminderResult> {
	return db.transaction(async (tx) => {
		// The open tasks come first and they carry the tenancy: `speaker_profile` belongs
		// to the organization, not to one conference, so the conference scope has to come
		// from `task`. A speaker profile id from another conference's form selects no
		// task here and is reported as having nothing outstanding, never mailed.
		const [pending] = await tx
			.select({ count: count() })
			.from(taskTable)
			.where(
				and(
					eq(taskTable.conferenceId, conference.id),
					eq(taskTable.speakerProfileId, speakerProfileId),
					eq(taskTable.status, 'open')
				)
			);
		const outstanding = Number(pending?.count ?? 0);
		if (outstanding === 0) return 'nothing_outstanding';

		const [speaker] = await tx
			.select({ email: speakerProfileTable.email })
			.from(speakerProfileTable)
			.where(eq(speakerProfileTable.id, speakerProfileId))
			.limit(1);
		const email = speaker?.email?.trim();
		if (!email) return 'no_email';

		const [waiting] = await tx
			.select({ id: emailLogTable.id })
			.from(emailLogTable)
			.where(
				and(
					eq(emailLogTable.conferenceId, conference.id),
					eq(emailLogTable.toEmail, email),
					eq(emailLogTable.template, 'task_reminder'),
					eq(emailLogTable.status, 'queued')
				)
			)
			.limit(1);
		if (waiting) return 'already_queued';

		await tx.insert(emailLogTable).values({
			conferenceId: conference.id,
			toEmail: email,
			template: 'task_reminder',
			subject: `${outstanding} ${conference.name} task${outstanding === 1 ? '' : 's'} still open`,
			bodyPreview: `You still have ${outstanding} open task${outstanding === 1 ? '' : 's'} for ${conference.name}. Open /portal to hand in what is missing.`,
			status: 'queued',
			relatedType: 'speaker',
			relatedId: speakerProfileId
		});
		return 'queued';
	});
}

/**
 * Reminds a chosen set of speakers about their open tasks.
 *
 * Rows first, one dispatch at the end: dispatch talks to the mail provider, and doing
 * that per speaker would turn one slow send into N while the organizer waits.
 */
export async function queueDeliverableReminders(
	conference: Conference,
	speakerProfileIds: number[]
): Promise<DeliverableReminderTally> {
	const tally: DeliverableReminderTally = {
		queued: 0,
		already_queued: 0,
		nothing_outstanding: 0,
		no_email: 0
	};

	for (const speakerProfileId of new Set(speakerProfileIds)) {
		tally[await queueDeliverableReminderRow(conference, speakerProfileId)] += 1;
	}

	if (tally.queued > 0) await dispatchConferenceEmails(conference.id);
	return tally;
}
