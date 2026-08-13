/**
 * Changing a conference's core fields after it exists.
 *
 * Dates are the load-bearing half: the range and the days the agenda stands on
 * are one fact, and a stored range whose days never followed is the bug #86
 * fixed. Name and venue ride along so a tool does not write those columns
 * itself — the settings dates action already went through a transaction; this
 * is that transaction, with the optional name/venue patch the new-conference
 * form never offered a second time.
 *
 * The slug is not here. Renaming the public address is not a thing the product
 * offers — see `isReservedSlug`.
 */
import { invalidRangeField } from '$lib/conference/conference-dates';
import { syncConferenceDays, type DaySync } from '$lib/server/conference/conference-days';
import { db } from '$lib/server/db';
import { conferenceTable, type Conference } from '$lib/server/db/conference/conference-schema';
import { eq } from 'drizzle-orm';

const MAX_NAME = 120;
const EMPTY: DaySync = { added: [], removed: [], keptInUse: [] };

export type ConferencePatch = {
	name?: string;
	venue?: string | null;
	startsOn?: string | null;
	endsOn?: string | null;
};

export type UpdateConferenceResult =
	| { ok: true; conference: Conference; days: DaySync }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'invalid'; field: 'name' | 'startsOn' | 'endsOn'; message: string };

export async function updateConference(
	conferenceId: number,
	patch: ConferencePatch
): Promise<UpdateConferenceResult> {
	const [current] = await db
		.select()
		.from(conferenceTable)
		.where(eq(conferenceTable.id, conferenceId))
		.limit(1);

	if (!current) return { ok: false, reason: 'not_found' };

	const name = patch.name !== undefined ? patch.name.trim() : current.name;
	if (!name || name.length > MAX_NAME) {
		return {
			ok: false,
			reason: 'invalid',
			field: 'name',
			message: 'Give the conference a name (at most 120 characters).'
		};
	}

	const startsOn = patch.startsOn !== undefined ? patch.startsOn : current.startsOn;
	const endsOn = patch.endsOn !== undefined ? patch.endsOn : current.endsOn;
	const badDate = invalidRangeField(startsOn, endsOn);
	if (badDate) {
		return {
			ok: false,
			reason: 'invalid',
			field: badDate,
			message:
				badDate === 'startsOn'
					? 'That start date is not a real date.'
					: 'Check the end date — it must be a real date, on or after the start.'
		};
	}

	const venue = patch.venue !== undefined ? patch.venue?.trim() || null : current.venue;
	const datesMove = startsOn !== current.startsOn || endsOn !== current.endsOn;

	const { conference, days } = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(conferenceTable)
			.set({ name, venue, startsOn, endsOn })
			.where(eq(conferenceTable.id, conferenceId))
			.returning();

		const synced = datesMove ? await syncConferenceDays(conferenceId, startsOn, endsOn, tx) : EMPTY;

		return { conference: updated, days: synced };
	});

	return { ok: true, conference, days };
}
