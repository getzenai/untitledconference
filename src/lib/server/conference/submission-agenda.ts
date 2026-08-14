/**
 * Where a submission stands in the programme (#412), for the organizer's table.
 *
 * Its own file rather than four more functions in `organizer-submissions.ts`:
 * this is one question — "is this talk on the grid, and where" — asked by the
 * column, the filter and the CSV export alike, and the reading side of the CFP
 * had already outgrown one screen.
 */
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import { conferenceDayTable, roomTable } from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm';

/** Where a talk sits on the grid, if it sits anywhere yet. */
export type AgendaSlot = {
	/** ISO day of the conference day the slot belongs to; null if the placement has none. */
	day: string | null;
	room: string | null;
	startsAt: Date;
	endsAt: Date | null;
	/** A confirmed slot is published; a tentative one is still a draft on the grid. */
	confirmed: boolean;
};

/** The two filter fields this module owns, kept apart from the rest of the bar. */
export type SubmissionFilters = {
	status?: string[];
	agenda?: 'scheduled' | 'unscheduled';
	includeDrafts?: boolean;
};

/**
 * Has this submission got a slot on the grid?
 *
 * A placement row alone is not enough: accepting a talk creates one in the tray,
 * with no day, room or time on it. `startsAt` is what separates "in the programme"
 * from "waiting for a slot", and it is the same column the agenda board sorts by.
 */
function scheduledWhere() {
	return exists(
		db
			.select({ one: sql`1` })
			.from(placementTable)
			.where(
				and(
					eq(placementTable.submissionId, submissionTable.id),
					sql`${placementTable.startsAt} is not null`
				)
			)
	);
}

/**
 * What the drafts checkbox and the agenda select add to the table's WHERE.
 *
 * Both defaults live here rather than in the URL parser, because the CSV export
 * and any later caller build filters of their own — a default only the parser
 * knows is one every other caller silently gets wrong.
 */
export function programmeWhere(filters: SubmissionFilters): SQL[] {
	const where: SQL[] = [];

	// Drafts are out by default. Naming `draft` in the status boxes counts as asking
	// for them: a link someone pasted before this changed still shows what it
	// promised, instead of an empty table under a checked box.
	const draftsAsked = filters.includeDrafts || filters.status?.includes('draft');
	if (!draftsAsked) where.push(sql`${submissionTable.status} <> 'draft'`);

	if (filters.agenda === 'scheduled') where.push(scheduledWhere());
	if (filters.agenda === 'unscheduled') where.push(sql`not ${scheduledWhere()}`);

	return where;
}

/**
 * The grid slot behind each of a set of submissions, in one query.
 *
 * One row per submission even though a tentative talk may be parked on several
 * slots at once — the column answers "where is this in the programme", and a cell
 * that lists three answers answers nothing. Confirmed beats tentative, and among
 * equals the earliest slot wins, which is the same order the agenda reads.
 */
export async function agendaSlotsFor(submissionIds: number[]): Promise<Map<number, AgendaSlot>> {
	const byId = new Map<number, AgendaSlot>();
	if (submissionIds.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: placementTable.submissionId,
			day: conferenceDayTable.date,
			room: roomTable.name,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt,
			status: placementTable.status
		})
		.from(placementTable)
		.leftJoin(conferenceDayTable, eq(conferenceDayTable.id, placementTable.conferenceDayId))
		.leftJoin(roomTable, eq(roomTable.id, placementTable.roomId))
		.where(
			and(
				inArray(placementTable.submissionId, submissionIds),
				sql`${placementTable.startsAt} is not null`
			)
		)
		.orderBy(sql`(${placementTable.status} = 'confirmed') desc`, asc(placementTable.startsAt));

	for (const row of rows) {
		// First row per submission wins — the order above already decided which.
		if (row.submissionId === null || byId.has(row.submissionId)) continue;
		byId.set(row.submissionId, {
			day: row.day,
			room: row.room,
			startsAt: row.startsAt!,
			endsAt: row.endsAt,
			confirmed: row.status === 'confirmed'
		});
	}

	return byId;
}
