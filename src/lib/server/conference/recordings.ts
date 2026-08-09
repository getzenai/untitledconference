/**
 * The write side of #20 stage 1: the organizer pastes the video link after the event.
 *
 * A separate module from `organizer-submissions` because that one is the reading side
 * and says so in its header. There is exactly one write here, and it carries the
 * conference scope with it rather than trusting the caller to have checked.
 */
import { db } from '$lib/server/db';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, eq } from 'drizzle-orm';

/**
 * Sets (or, with null, clears) the recording link of one placement.
 *
 * Scoped by conference as well as by id for the same reason `submissionHeader` is:
 * an organizer of conference A must not reach conference B's programme by editing a
 * hidden field. Returns false when nothing matched, so the caller can answer 404
 * rather than reporting a success that never happened.
 *
 * `confirmed` is in the WHERE clause for the same reason the field only appears on a
 * confirmed placement in the UI: a draft parked on three tentative slots has no answer
 * to "which of these was recorded". The UI not offering it is not a guarantee — the
 * placement id arrives in a form field, so the rule belongs where the write happens.
 */
export async function setRecordingUrl(
	conferenceId: number,
	placementId: number,
	url: string | null
): Promise<boolean> {
	const updated = await db
		.update(placementTable)
		.set({ recordingUrl: url })
		.where(
			and(
				eq(placementTable.id, placementId),
				eq(placementTable.conferenceId, conferenceId),
				eq(placementTable.status, 'confirmed')
			)
		)
		.returning({ id: placementTable.id });

	return updated.length > 0;
}
