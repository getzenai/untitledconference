/**
 * The organizer's side of the programme grid.
 *
 * The placement schema has always been able to express a scheduled conference —
 * tentative drafts, confirmed slots, breaks, the partial unique index that stops one
 * talk being confirmed twice. What was missing was any screen that writes to it, so
 * the public agenda rendered a state only a seed script could produce. This module is
 * the write side.
 *
 * Two decisions shape everything here:
 *
 *  1. **An accepted talk already has a placement.** Deciding creates a `tentative` row
 *     with no day, time or room — the tray. Scheduling is therefore an UPDATE of an
 *     existing row, never an insert, which is what keeps the one-confirmed-per-
 *     submission index meaningful.
 *
 *  2. **Conflicts are queries, not columns.** Two talks in one room, or one speaker in
 *     two rooms, is a fact about the current rows; storing it would mean maintaining it
 *     on every move. AIA-04/05/06 move sessions repeatedly, and a cached flag is
 *     exactly the kind that goes stale without anyone noticing.
 *
 * The end time is computed from the session format rather than asked for. An organizer
 * choosing a start and being handed an end cannot accidentally book a 30-minute talk
 * into a 15-minute hole, and the format already carries the length.
 */
import { db } from '$lib/server/db';
import { submissionSpeakerTable, submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	conferenceDayTable,
	roomTable,
	sessionFormatTable,
	speakerProfileTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

/** The working day the grid offers slots across. */
export const DAY_STARTS_AT = 9 * 60;
export const DAY_ENDS_AT = 18 * 60;
const SLOT_MINUTES = 15;
/** Fallback for a submission whose format carries no length. */
const DEFAULT_MINUTES = 30;

export type SlotOption = { minutes: number; label: string };

/** Every start time the grid offers, as minutes from midnight. */
export function slotOptions(): SlotOption[] {
	const options: SlotOption[] = [];
	for (let m = DAY_STARTS_AT; m < DAY_ENDS_AT; m += SLOT_MINUTES) {
		const hh = String(Math.floor(m / 60)).padStart(2, '0');
		const mm = String(m % 60).padStart(2, '0');
		options.push({ minutes: m, label: `${hh}:${mm}` });
	}
	return options;
}

/**
 * A slot as an absolute instant.
 *
 * The conference day is a calendar date and the grid is drawn in the conference's own
 * clock, so the two are combined as UTC. Reading a stored instant back with anything
 * other than UTC would shift every session by the reader's offset — the same class of
 * bug as the 2001 date, and the reason the public view slices ISO strings.
 */
export function slotInstant(date: string, minutes: number): Date {
	const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
	const mm = String(minutes % 60).padStart(2, '0');
	return new Date(`${date}T${hh}:${mm}:00Z`);
}

/** Minutes from midnight of a stored instant, read back in the same clock it was written. */
export function slotMinutes(value: Date): number {
	return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export type BoardSession = {
	placementId: number;
	submissionId: number | null;
	title: string;
	kind: string;
	status: string;
	trackName: string | null;
	formatName: string | null;
	minutes: number;
	dayId: number | null;
	roomId: number | null;
	startMinutes: number | null;
	endMinutes: number | null;
	speakers: string[];
};

export type AgendaBoard = {
	days: { id: number; date: string; position: number }[];
	rooms: { id: number; name: string; position: number }[];
	tracks: { id: number; name: string }[];
	formats: { id: number; name: string; minutes: number | null }[];
	placed: BoardSession[];
	tray: BoardSession[];
	conflicts: Conflict[];
};

type PlacementRow = {
	placementId: number;
	submissionId: number | null;
	kind: string;
	status: string;
	blockTitle: string | null;
	submissionTitle: string | null;
	trackName: string | null;
	formatName: string | null;
	formatMinutes: number | null;
	dayId: number | null;
	roomId: number | null;
	startsAt: Date | null;
	endsAt: Date | null;
};

function selectPlacements(conferenceId: number) {
	return db
		.select({
			placementId: placementTable.id,
			submissionId: placementTable.submissionId,
			kind: placementTable.kind,
			status: placementTable.status,
			blockTitle: placementTable.title,
			submissionTitle: submissionTable.title,
			trackName: trackTable.name,
			formatName: sessionFormatTable.name,
			formatMinutes: sessionFormatTable.minutes,
			dayId: placementTable.conferenceDayId,
			roomId: placementTable.roomId,
			startsAt: placementTable.startsAt,
			endsAt: placementTable.endsAt
		})
		.from(placementTable)
		.leftJoin(submissionTable, eq(submissionTable.id, placementTable.submissionId))
		.leftJoin(trackTable, eq(trackTable.id, submissionTable.trackId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.where(eq(placementTable.conferenceId, conferenceId))
		.orderBy(asc(placementTable.startsAt), asc(placementTable.id));
}

async function speakersBySubmission(ids: number[]): Promise<Map<number, string[]>> {
	const byId = new Map<number, string[]>();
	if (ids.length === 0) return byId;

	const rows = await db
		.select({
			submissionId: submissionSpeakerTable.submissionId,
			name: speakerProfileTable.name
		})
		.from(submissionSpeakerTable)
		.innerJoin(
			speakerProfileTable,
			eq(speakerProfileTable.id, submissionSpeakerTable.speakerProfileId)
		)
		.where(inArray(submissionSpeakerTable.submissionId, ids))
		.orderBy(asc(submissionSpeakerTable.position));

	for (const r of rows) {
		byId.set(r.submissionId, [...(byId.get(r.submissionId) ?? []), r.name]);
	}
	return byId;
}

function toSession(row: PlacementRow, speakers: Map<number, string[]>): BoardSession {
	return {
		placementId: row.placementId,
		submissionId: row.submissionId,
		title: row.submissionTitle ?? row.blockTitle ?? 'Untitled',
		kind: row.kind,
		status: row.status,
		trackName: row.trackName,
		formatName: row.formatName,
		minutes: row.formatMinutes ?? DEFAULT_MINUTES,
		dayId: row.dayId,
		roomId: row.roomId,
		startMinutes: row.startsAt ? slotMinutes(row.startsAt) : null,
		endMinutes: row.endsAt ? slotMinutes(row.endsAt) : null,
		speakers: row.submissionId ? (speakers.get(row.submissionId) ?? []) : []
	};
}

/**
 * Is this placement on the grid?
 *
 * A session needs all three of day, time and room. A break does not: a null room means
 * "across every room", which is how lunch is expressed, and requiring one would drop
 * every break into the tray offering to schedule it into a single room. That is what
 * this screen did on its first run against the demo tenant — three lunches queued as
 * talks needing a slot.
 */
function isPlaced(row: PlacementRow): boolean {
	if (row.dayId === null || row.startsAt === null) return false;
	return row.kind !== 'session' || row.roomId !== null;
}

export async function agendaBoard(conferenceId: number): Promise<AgendaBoard> {
	const [days, rooms, tracks, formats, placements] = await Promise.all([
		db
			.select({
				id: conferenceDayTable.id,
				date: conferenceDayTable.date,
				position: conferenceDayTable.position
			})
			.from(conferenceDayTable)
			.where(eq(conferenceDayTable.conferenceId, conferenceId))
			.orderBy(asc(conferenceDayTable.position), asc(conferenceDayTable.date)),
		db
			.select({ id: roomTable.id, name: roomTable.name, position: roomTable.position })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conferenceId))
			.orderBy(asc(roomTable.position), asc(roomTable.id)),
		db
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position), asc(trackTable.id)),
		db
			.select({
				id: sessionFormatTable.id,
				name: sessionFormatTable.name,
				minutes: sessionFormatTable.minutes
			})
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position), asc(sessionFormatTable.id)),
		selectPlacements(conferenceId)
	]);

	const speakers = await speakersBySubmission(
		placements.map((p) => p.submissionId).filter((id): id is number => id !== null)
	);

	return {
		days,
		rooms,
		tracks,
		formats,
		placed: placements.filter(isPlaced).map((p) => toSession(p, speakers)),
		tray: placements.filter((p) => !isPlaced(p)).map((p) => toSession(p, speakers)),
		conflicts: await conflicts(conferenceId)
	};
}

export type Conflict = {
	kind: 'room' | 'speaker';
	placementIds: [number, number];
	detail: string;
};

/**
 * Overlapping placements in one room.
 *
 * A break with a null room spans every room by definition, so it is excluded rather
 * than reported against each one — flagging lunch as a clash with all four rooms would
 * bury the conflicts that matter.
 */
async function roomConflicts(conferenceId: number): Promise<Conflict[]> {
	const rows = await db.execute<{ a: number; b: number; room: string; at: string }>(sql`
		SELECT a.id AS a, b.id AS b, r.name AS room, to_char(a.starts_at AT TIME ZONE 'UTC', 'HH24:MI') AS at
		FROM placement a
		JOIN placement b
			ON a.id < b.id
			AND a.conference_day_id = b.conference_day_id
			AND a.room_id = b.room_id
			AND a.starts_at < b.ends_at
			AND b.starts_at < a.ends_at
		JOIN room r ON r.id = a.room_id
		WHERE a.conference_id = ${conferenceId}
			AND b.conference_id = ${conferenceId}
			AND a.room_id IS NOT NULL`);

	return rows.map((r) => ({
		kind: 'room' as const,
		placementIds: [r.a, r.b] as [number, number],
		detail: `Two sessions in ${r.room} at ${r.at}`
	}));
}

/** One speaker in two places at once — invisible on a grid read room by room. */
async function speakerConflicts(conferenceId: number): Promise<Conflict[]> {
	const rows = await db.execute<{ a: number; b: number; speaker: string; at: string }>(sql`
		SELECT a.id AS a, b.id AS b, sp.name AS speaker, to_char(a.starts_at AT TIME ZONE 'UTC', 'HH24:MI') AS at
		FROM placement a
		JOIN submission_speaker sa ON sa.submission_id = a.submission_id
		JOIN placement b
			ON a.id < b.id
			AND a.conference_day_id = b.conference_day_id
			AND a.starts_at < b.ends_at
			AND b.starts_at < a.ends_at
		JOIN submission_speaker sb
			ON sb.submission_id = b.submission_id
			AND sb.speaker_profile_id = sa.speaker_profile_id
		JOIN speaker_profile sp ON sp.id = sa.speaker_profile_id
		WHERE a.conference_id = ${conferenceId} AND b.conference_id = ${conferenceId}`);

	return rows.map((r) => ({
		kind: 'speaker' as const,
		placementIds: [r.a, r.b] as [number, number],
		detail: `${r.speaker} is in two sessions at ${r.at}`
	}));
}

export async function conflicts(conferenceId: number): Promise<Conflict[]> {
	const [rooms, speakers] = await Promise.all([
		roomConflicts(conferenceId),
		speakerConflicts(conferenceId)
	]);
	return [...rooms, ...speakers];
}

/** One placement of this conference's, or null. Scoping lives in the query. */
async function ownPlacement(conferenceId: number, placementId: number) {
	const [row] = await db
		.select({
			id: placementTable.id,
			submissionId: placementTable.submissionId,
			status: placementTable.status,
			formatMinutes: sessionFormatTable.minutes
		})
		.from(placementTable)
		.leftJoin(submissionTable, eq(submissionTable.id, placementTable.submissionId))
		.leftJoin(sessionFormatTable, eq(sessionFormatTable.id, submissionTable.sessionFormatId))
		.where(and(eq(placementTable.id, placementId), eq(placementTable.conferenceId, conferenceId)))
		.limit(1);

	return row ?? null;
}

export type PlaceResult = { ok: true; endMinutes: number } | { ok: false; reason: string };

/**
 * Puts a session on the grid, or moves one that is already there.
 *
 * Deliberately permissive about conflicts: an organizer mid-rearrangement passes
 * through invalid states on the way to a valid one, and a builder that refuses the
 * intermediate step forces them to undo before they can redo. The clash is reported,
 * not prevented — AIA-05 asks to *see* the warning.
 *
 * The one thing it does refuse is a day that is being deleted underneath it. The
 * day is read `FOR KEY SHARE` and the write happens in the same transaction, so
 * a range shrink running at the same time (`syncConferenceDays`) either sees this
 * placement and keeps the day, or takes the day and leaves this call reporting
 * "No such day". Without the shared transaction the lock would end with the read
 * and the write would land on a row that no longer exists — a foreign key error
 * where a plain answer belongs.
 */
export async function placeSession(
	conferenceId: number,
	placementId: number,
	slot: { dayId: number; roomId: number; startMinutes: number }
): Promise<PlaceResult> {
	const placement = await ownPlacement(conferenceId, placementId);
	if (!placement) return { ok: false, reason: 'No such session' };

	return db.transaction(async (tx) => {
		const [day] = await tx
			.select({ date: conferenceDayTable.date })
			.from(conferenceDayTable)
			.where(
				and(
					eq(conferenceDayTable.id, slot.dayId),
					eq(conferenceDayTable.conferenceId, conferenceId)
				)
			)
			.limit(1)
			.for('key share');
		if (!day) return { ok: false, reason: 'No such day' };

		const [room] = await tx
			.select({ id: roomTable.id })
			.from(roomTable)
			.where(and(eq(roomTable.id, slot.roomId), eq(roomTable.conferenceId, conferenceId)))
			.limit(1);
		if (!room) return { ok: false, reason: 'No such room' };

		if (slot.startMinutes < DAY_STARTS_AT || slot.startMinutes >= DAY_ENDS_AT) {
			return { ok: false, reason: 'That start time is outside the conference day' };
		}

		const minutes = placement.formatMinutes ?? DEFAULT_MINUTES;
		const endMinutes = slot.startMinutes + minutes;

		await tx
			.update(placementTable)
			.set({
				conferenceDayId: slot.dayId,
				roomId: slot.roomId,
				startsAt: slotInstant(day.date, slot.startMinutes),
				endsAt: slotInstant(day.date, endMinutes)
			})
			.where(eq(placementTable.id, placementId));

		return { ok: true, endMinutes };
	});
}

/**
 * Takes a session off the grid and back into the tray.
 *
 * The status drops to tentative with it: a confirmed placement with no slot would
 * claim to be published while having nowhere to be, and the public agenda filters on
 * status, not on whether the times happen to be set.
 */
export async function unplaceSession(conferenceId: number, placementId: number): Promise<boolean> {
	const placement = await ownPlacement(conferenceId, placementId);
	if (!placement) return false;

	await db
		.update(placementTable)
		.set({
			conferenceDayId: null,
			roomId: null,
			startsAt: null,
			endsAt: null,
			status: 'tentative'
		})
		.where(eq(placementTable.id, placementId));

	return true;
}

/**
 * Trades the slots of two scheduled sessions, both or neither.
 *
 * The organizer's actual move is "these two are in the wrong order". Built from the
 * pieces that already exist that is unplace-unplace-place-place, and the honest
 * description of that sequence is *lossy*: between the steps a session sits in the
 * tray with nothing to say it is on its way somewhere. Any interruption — a lost
 * connection, a second tab, a deploy — leaves a talk unscheduled and nobody told.
 * So this is one write, and the two rows move together or not at all.
 *
 * Both rows are locked `FOR UPDATE` **lowest id first**. Two organizers swapping the
 * same pair from opposite ends would otherwise each hold one row and wait for the
 * other's; Postgres breaks that by aborting one with a deadlock error, which reaches
 * the loser as a 500. A fixed order turns the race into a queue.
 *
 * The days are read `FOR KEY SHARE` for the same reason `placeSession` does it (#93):
 * the write and the existence check have to share a transaction, or a concurrent day
 * range shrink turns a plain answer into a foreign key error. Both days are locked in
 * id order too, for the same reason the placements are.
 *
 * The permissive clash rule (AIA-05) is untouched. A swap can still land a longer talk
 * on top of its new neighbour, and that is reported like any other clash rather than
 * refused — nobody asks for a swap as an intermediate step, so the only refusals here
 * are nonsense inputs: a session with itself, a stranger's session, a partner that has
 * no slot to trade.
 *
 * Each session keeps its **own** length. Swapping a 30-minute talk with a 45-minute
 * one exchanges their start times; inheriting the other's end would silently restate
 * how long somebody is speaking.
 */
export async function swapPlacements(
	conferenceId: number,
	placementId: number,
	withPlacementId: number
): Promise<PlaceResult> {
	if (placementId === withPlacementId) {
		return { ok: false, reason: 'A session cannot swap with itself' };
	}

	const [first, second] = await Promise.all([
		ownPlacement(conferenceId, placementId),
		ownPlacement(conferenceId, withPlacementId)
	]);
	if (!first || !second) return { ok: false, reason: 'No such session' };

	// Ascending id, so every swap in this conference queues on the same order.
	const lockOrder = [placementId, withPlacementId].sort((a, b) => a - b);

	return db.transaction(async (tx) => {
		const locked = new Map<number, LockedSlot>();
		for (const id of lockOrder) {
			const [row] = await tx
				.select({
					id: placementTable.id,
					conferenceDayId: placementTable.conferenceDayId,
					roomId: placementTable.roomId,
					startsAt: placementTable.startsAt
				})
				.from(placementTable)
				.where(eq(placementTable.id, id))
				.limit(1)
				.for('update');
			if (!row) return { ok: false, reason: 'No such session' };
			locked.set(id, row);
		}

		const a = locked.get(placementId);
		const b = locked.get(withPlacementId);

		// Read under the lock rather than from the snapshot taken before it: the other
		// session may have been pulled off the grid while this call waited its turn.
		if (!a || !b || !onGrid(a) || !onGrid(b)) {
			return { ok: false, reason: 'Both sessions have to be on the grid to swap' };
		}

		for (const dayId of [...new Set([a.conferenceDayId, b.conferenceDayId])].sort(
			(x, y) => x - y
		)) {
			const [day] = await tx
				.select({ id: conferenceDayTable.id })
				.from(conferenceDayTable)
				.where(
					and(eq(conferenceDayTable.id, dayId), eq(conferenceDayTable.conferenceId, conferenceId))
				)
				.limit(1)
				.for('key share');
			if (!day) return { ok: false, reason: 'No such day' };
		}

		await moveTo(tx, a.id, b, first.formatMinutes ?? DEFAULT_MINUTES);
		await moveTo(tx, b.id, a, second.formatMinutes ?? DEFAULT_MINUTES);

		return {
			ok: true,
			endMinutes: slotMinutes(b.startsAt) + (first.formatMinutes ?? DEFAULT_MINUTES)
		};
	});
}

type LockedSlot = {
	id: number;
	conferenceDayId: number | null;
	roomId: number | null;
	startsAt: Date | null;
};

/** A placement with an actual slot — the tray has no position to trade. */
function onGrid(
	slot: LockedSlot
): slot is LockedSlot & { conferenceDayId: number; startsAt: Date } {
	return slot.conferenceDayId !== null && slot.startsAt !== null;
}

/** Writes one half of a swap: this placement, at that slot, with its own length. */
function moveTo(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	placementId: number,
	slot: LockedSlot & { conferenceDayId: number; startsAt: Date },
	minutes: number
) {
	const startsAt = slot.startsAt;
	const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

	return tx
		.update(placementTable)
		.set({
			conferenceDayId: slot.conferenceDayId,
			roomId: slot.roomId,
			startsAt,
			endsAt
		})
		.where(eq(placementTable.id, placementId));
}

/**
 * Publishes every scheduled session, or pulls them all back to tentative.
 *
 * Only placements with a slot are published. A tray item promoted to confirmed would
 * satisfy the unique index and then be invisible on the agenda, which is a worse
 * outcome than staying honestly unscheduled.
 */
export async function setAgendaPublished(
	conferenceId: number,
	published: boolean
): Promise<number> {
	const rows = await db
		.update(placementTable)
		.set({ status: published ? 'confirmed' : 'tentative' })
		.where(
			and(
				eq(placementTable.conferenceId, conferenceId),
				published ? sql`starts_at IS NOT NULL AND room_id IS NOT NULL` : sql`true`,
				ne(placementTable.status, published ? 'confirmed' : 'tentative')
			)
		)
		.returning({ id: placementTable.id });

	return rows.length;
}

/** One session's own status, so a single talk can be held back or released. */
export async function setPlacementStatus(
	conferenceId: number,
	placementId: number,
	status: 'tentative' | 'confirmed'
): Promise<boolean> {
	const placement = await ownPlacement(conferenceId, placementId);
	if (!placement) return false;

	await db.update(placementTable).set({ status }).where(eq(placementTable.id, placementId));
	return true;
}

/** @deprecated Prefer `$lib/server/conference/config` — rooms live in settings (#63). */
export { addRoom, addTrack } from './config';

type Window = { start: number; end: number };

/**
 * What is already spoken for, while auto-place is deciding.
 *
 * Kept in memory rather than re-queried per candidate slot: the filler considers every
 * room in every quarter hour of every day, and asking the database each time would turn
 * one button into thousands of round trips.
 */
class Occupancy {
	private readonly windows = new Map<string, Window[]>();

	add(key: string, start: number, end: number) {
		this.windows.set(key, [...(this.windows.get(key) ?? []), { start, end }]);
	}

	free(key: string, start: number, end: number): boolean {
		return !(this.windows.get(key) ?? []).some((o) => start < o.end && o.start < end);
	}
}

const roomKey = (dayId: number | null, roomId: number | null) => `${dayId}:${roomId}`;
const speakerKey = (dayId: number | null, speaker: string) => `${dayId}:${speaker}`;

/**
 * Fills the tray into the first free slot that creates no clash.
 *
 * Greedy and deliberately unclever: longest sessions first, because a 120-minute
 * workshop placed last has nowhere left to go, then the earliest free room-slot that
 * conflicts with neither the room nor any of that talk's speakers. It is a starting
 * point an organizer then adjusts, not an optimiser — and every placement it makes is
 * one they can move.
 */
export async function autoPlace(conferenceId: number): Promise<number> {
	const board = await agendaBoard(conferenceId);
	if (board.days.length === 0 || board.rooms.length === 0) return 0;

	const rooms = new Occupancy();
	const speakers = new Occupancy();
	const occupy = (session: {
		dayId: number | null;
		roomId: number | null;
		speakers: string[];
		start: number;
		end: number;
	}) => {
		rooms.add(roomKey(session.dayId, session.roomId), session.start, session.end);
		for (const s of session.speakers) {
			speakers.add(speakerKey(session.dayId, s), session.start, session.end);
		}
	};

	for (const p of board.placed) {
		if (p.startMinutes === null || p.endMinutes === null) continue;
		occupy({ ...p, start: p.startMinutes, end: p.endMinutes });
	}

	// Longest first: a 120-minute workshop placed last has nowhere left to go.
	const queue = [...board.tray]
		.filter((t) => t.kind === 'session')
		.sort((a, b) => b.minutes - a.minutes || a.placementId - b.placementId);

	let placed = 0;
	for (const item of queue) {
		const slot = findSlot(item, board, rooms, speakers);
		if (!slot) continue;

		const result = await placeSession(conferenceId, item.placementId, slot);
		if (!result.ok) continue;

		occupy({ ...slot, speakers: item.speakers, start: slot.startMinutes, end: result.endMinutes });
		placed += 1;
	}

	return placed;
}

type Slot = { dayId: number; roomId: number; startMinutes: number };

/** The first room free across this window, or null if every one is taken. */
function freeRoom(
	board: AgendaBoard,
	rooms: Occupancy,
	dayId: number,
	start: number,
	end: number
): number | null {
	return board.rooms.find((r) => rooms.free(roomKey(dayId, r.id), start, end))?.id ?? null;
}

function findSlot(
	item: BoardSession,
	board: AgendaBoard,
	rooms: Occupancy,
	speakers: Occupancy
): Slot | null {
	for (const day of board.days) {
		for (const start of slotOptions()) {
			const end = start.minutes + item.minutes;
			if (end > DAY_ENDS_AT) continue;

			// The speaker check comes first because it rules out the whole time slot,
			// not just one room — checking rooms first would be work thrown away.
			const speakerBusy = item.speakers.some(
				(s) => !speakers.free(speakerKey(day.id, s), start.minutes, end)
			);
			if (speakerBusy) continue;

			const roomId = freeRoom(board, rooms, day.id, start.minutes, end);
			if (roomId !== null) return { dayId: day.id, roomId, startMinutes: start.minutes };
		}
	}
	return null;
}

/** Accepted talks that have no placement row at all — a decision made before this feature. */
export async function backfillTray(conferenceId: number): Promise<number> {
	const orphans = await db
		.select({ id: submissionTable.id })
		.from(submissionTable)
		.leftJoin(placementTable, eq(placementTable.submissionId, submissionTable.id))
		.where(
			and(
				eq(submissionTable.conferenceId, conferenceId),
				eq(submissionTable.status, 'accepted'),
				isNull(placementTable.id)
			)
		);

	if (orphans.length === 0) return 0;

	await db.insert(placementTable).values(
		orphans.map((o) => ({
			conferenceId,
			kind: 'session' as const,
			status: 'tentative' as const,
			submissionId: o.id
		}))
	);

	return orphans.length;
}
