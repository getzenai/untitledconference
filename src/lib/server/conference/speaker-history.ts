/**
 * What this speaker did at our earlier editions (#451, layer 1).
 *
 * The fourth-strongest argument in a real decision meeting is a returning speaker's
 * track record, and it has always lived in somebody else's tool. Half of it is
 * already ours: `speaker_profile` spans editions inside an organization, and a
 * confirmed `placement` is the record that the talk was actually held. Joining the
 * two gives "has spoken here three times, most recently 2025" with no new data
 * source and no new table.
 *
 * Three things this deliberately does not do:
 *
 * - **It does not count acceptances.** Only a CONFIRMED placement counts, because
 *   that is the published grid. A talk that was accepted and then dropped never
 *   happened, and a veto argument built on it would be false.
 * - **It does not count the future.** The other edition must have ENDED. "Spoke
 *   here before" is past tense; a sibling event three months out is not history.
 * - **It does not leave the organization, and it never includes the conference
 *   being decided.** Both are in the WHERE clause, not in the caller's discipline.
 *
 * Attendee ratings — the other half of #451, and the part the organizer called
 * decisive — need a post-event feedback capture that does not exist. Out of scope
 * on purpose; nothing here pretends to hold a score.
 *
 * **Anonymised rounds.** This is identity. A reviewer who may not see the speaker's
 * name may not see that they keynoted in 2024 either — one line of it names them
 * more reliably than the name does. The caller on the reviewer surface gates this
 * behind the same `anonymized` branch that already drops `speakers` and the custom
 * answers; see `reviewer.ts`.
 */
import type { PastAppearance, SpeakerHistory } from '$lib/conference/speaker-history';
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceTable, speakerProfileTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, desc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';

export type { PastAppearance, SpeakerHistory };

/** The speakers on one submission, in the order the submission lists them. */
async function speakersOnSubmission(
	submissionId: number
): Promise<{ speakerProfileId: number; name: string }[]> {
	return db
		.select({ speakerProfileId: speakerProfileTable.id, name: speakerProfileTable.name })
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(eq(submissionSpeakerTable.submissionId, submissionId))
		.orderBy(desc(submissionSpeakerTable.isPrimary), asc(submissionSpeakerTable.position));
}

/**
 * The talks these profiles held at editions of `organizationId` that have already
 * ended, newest first.
 *
 * One query for every speaker on the talk rather than one per speaker: a submission
 * with four co-authors is not four round trips.
 */
async function pastAppearances(
	organizationId: string,
	currentConferenceId: number,
	speakerProfileIds: number[]
): Promise<Map<number, PastAppearance[]>> {
	const byProfile = new Map<number, PastAppearance[]>();
	if (speakerProfileIds.length === 0) return byProfile;

	const rows = await db
		.selectDistinct({
			speakerProfileId: submissionSpeakerTable.speakerProfileId,
			conferenceId: conferenceTable.id,
			conferenceName: conferenceTable.name,
			endsOn: conferenceTable.endsOn,
			startsOn: conferenceTable.startsOn,
			talkTitle: submissionTable.title
		})
		.from(submissionSpeakerTable)
		.innerJoin(submissionTable, eq(submissionTable.id, submissionSpeakerTable.submissionId))
		.innerJoin(conferenceTable, eq(conferenceTable.id, submissionTable.conferenceId))
		.innerJoin(
			placementTable,
			and(
				eq(placementTable.submissionId, submissionTable.id),
				eq(placementTable.status, 'confirmed')
			)
		)
		.where(
			and(
				inArray(submissionSpeakerTable.speakerProfileId, speakerProfileIds),
				eq(conferenceTable.organizationId, organizationId),
				ne(conferenceTable.id, currentConferenceId),
				isNotNull(conferenceTable.endsOn),
				lt(conferenceTable.endsOn, sql`current_date`)
			)
		)
		.orderBy(desc(conferenceTable.endsOn), asc(submissionTable.title));

	for (const { speakerProfileId, endsOn, startsOn, ...rest } of rows) {
		const list = byProfile.get(speakerProfileId) ?? [];
		// The year comes from the start date, and falls back to the end date: an
		// edition that spans New Year is named after the day it opened.
		const stamp = startsOn ?? endsOn;
		list.push({ ...rest, year: stamp ? Number(stamp.slice(0, 4)) : null });
		byProfile.set(speakerProfileId, list);
	}
	return byProfile;
}

/**
 * Speaker history for one submission — one entry per speaker on the talk, in the
 * submission's own order, whether or not they have a history.
 *
 * A first-timer is a row with no appearances rather than a missing row: "we have
 * never had them" is an answer the meeting wants, and a surface that only ever
 * shows returning speakers cannot tell it apart from "we did not look".
 */
export async function speakerHistoryForSubmission(
	conference: { id: number; organizationId: string },
	submissionId: number
): Promise<SpeakerHistory[]> {
	const speakers = await speakersOnSubmission(submissionId);
	if (speakers.length === 0) return [];

	const history = await pastAppearances(
		conference.organizationId,
		conference.id,
		speakers.map((s) => s.speakerProfileId)
	);

	return speakers.map((speaker) => ({
		...speaker,
		appearances: history.get(speaker.speakerProfileId) ?? []
	}));
}
