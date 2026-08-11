/** Organizer-authored mail to the currently filtered conference roster (SPK-13). */
import { db } from '$lib/server/db';
import { emailLogTable } from '$lib/server/db/conference/email-schema';
import { listConferenceSpeakers, type SpeakerRosterFilters } from './speakers';

export type SpeakerMailQueueResult = { queued: number; withoutEmail: number };

export async function queueSpeakerMail(
	conferenceId: number,
	filters: SpeakerRosterFilters,
	subject: string,
	body: string
): Promise<SpeakerMailQueueResult> {
	const speakers = await listConferenceSpeakers(conferenceId, filters);
	const recipients = new Map<string, number>();
	let withoutEmail = 0;
	for (const speaker of speakers) {
		const email = speaker.email?.trim().toLowerCase();
		if (!email) {
			withoutEmail += 1;
			continue;
		}
		if (!recipients.has(email)) recipients.set(email, speaker.speakerProfileId);
	}

	const rows = [...recipients].map(([toEmail, speakerProfileId]) => ({
		conferenceId,
		toEmail,
		template: 'speaker_bulk',
		subject,
		bodyPreview: body,
		status: 'queued' as const,
		relatedType: 'speaker',
		relatedId: speakerProfileId
	}));
	if (rows.length > 0) await db.insert(emailLogTable).values(rows);
	return { queued: rows.length, withoutEmail };
}
