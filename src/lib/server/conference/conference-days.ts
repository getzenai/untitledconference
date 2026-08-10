/**
 * Keeping `conference_day` in step with the conference's date range.
 *
 * Days used to exist only in the seed script, so a conference nobody seeded had
 * no grid at all and the agenda sent the organizer to a settings page that could
 * not help them (#86). The fix is not a day editor: the range is already stated
 * once, and the days follow from it.
 *
 * The one thing this must not do is lose work. `placement.conference_day_id`
 * cascades on delete, so removing a day removes every session on it without a
 * word. Shrinking the range therefore only clears days that are *empty*; a day
 * that still holds something stays, and the caller is told which, so the
 * organizer can move those sessions and shrink again.
 */
import { datesInRange } from '$lib/conference/conference-dates';
import { db } from '$lib/server/db';
import { conferenceDayTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DaySync = {
	/** Days created because the range grew or nothing existed yet. */
	added: string[];
	/** Days dropped because they fell outside the range and held nothing. */
	removed: string[];
	/** Days outside the range that were kept because sessions hang on them. */
	keptInUse: string[];
};

const EMPTY: DaySync = { added: [], removed: [], keptInUse: [] };

/**
 * Derive the conference's days from its range, in one transaction.
 *
 * Idempotent by construction: it compares the two sets rather than replacing
 * one with the other, so running it twice changes nothing the second time and
 * — decisively — the day rows that survive keep their ids. Placements point at
 * those ids; a delete-and-recreate would take the whole grid with it.
 */
export async function syncConferenceDays(
	conferenceId: number,
	startsOn: string | null,
	endsOn: string | null,
	tx?: Tx
): Promise<DaySync> {
	if (!tx) return db.transaction((t) => syncConferenceDays(conferenceId, startsOn, endsOn, t));

	const wanted = datesInRange(startsOn, endsOn);

	// No start date is not "no days" — it is "not stated yet". Deriving an empty
	// set from it would delete a grid the organizer built before they cleared a
	// field by accident.
	if (wanted.length === 0) return EMPTY;

	const existing = await tx
		.select({ id: conferenceDayTable.id, date: conferenceDayTable.date })
		.from(conferenceDayTable)
		.where(eq(conferenceDayTable.conferenceId, conferenceId))
		.orderBy(asc(conferenceDayTable.date));

	const wantedSet = new Set(wanted);
	const known = new Set(existing.map((day) => day.date));

	const added = wanted.filter((date) => !known.has(date));
	const stale = existing.filter((day) => !wantedSet.has(day.date));

	const inUse =
		stale.length > 0 ? await daysWithPlacements(tx, stale.map(byId)) : new Set<number>();
	const removable = stale.filter((day) => !inUse.has(day.id));

	if (removable.length > 0) {
		await tx.delete(conferenceDayTable).where(inArray(conferenceDayTable.id, removable.map(byId)));
	}

	if (added.length > 0) {
		await tx
			.insert(conferenceDayTable)
			.values(added.map((date) => ({ conferenceId, date, position: 0 })));
	}

	await renumber(tx, conferenceId);

	return {
		added,
		removed: removable.map((day) => day.date),
		keptInUse: stale.filter((day) => inUse.has(day.id)).map((day) => day.date)
	};
}

const byId = (day: { id: number }) => day.id;

/** Which of these days something is scheduled on. */
async function daysWithPlacements(tx: Tx, dayIds: number[]): Promise<Set<number>> {
	const rows = await tx
		.selectDistinct({ dayId: placementTable.conferenceDayId })
		.from(placementTable)
		.where(
			and(
				inArray(placementTable.conferenceDayId, dayIds),
				isNotNull(placementTable.conferenceDayId)
			)
		);

	return new Set(rows.map((row) => row.dayId!).filter((id): id is number => id !== null));
}

/**
 * Renumber `position` in date order.
 *
 * The board sorts by position first, so a day added in front of the others — or
 * an out-of-range day kept because it still holds sessions — would otherwise
 * land wherever its old number put it. Cheap: a conference has days, not rows.
 */
async function renumber(tx: Tx, conferenceId: number): Promise<void> {
	const days = await tx
		.select({ id: conferenceDayTable.id })
		.from(conferenceDayTable)
		.where(eq(conferenceDayTable.conferenceId, conferenceId))
		.orderBy(asc(conferenceDayTable.date));

	for (const [position, day] of days.entries()) {
		await tx.update(conferenceDayTable).set({ position }).where(eq(conferenceDayTable.id, day.id));
	}
}
