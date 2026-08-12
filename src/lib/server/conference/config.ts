/**
 * Conference-level configuration: rooms, tracks, session formats.
 *
 * These used to be half-buried (rooms/tracks only on the agenda builder; formats
 * nowhere). They belong on the conference settings surface (#63), not on the
 * scheduling grid.
 */
import {
	MAX_MINUTES,
	MAX_NAME,
	parseFormatLines,
	parseNames,
	type FormatLine
} from '$lib/conference/structure-lines';
import { db } from '$lib/server/db';
import { submissionTable } from '$lib/server/db/conference/cfp-schema';
import {
	membershipTrackTable,
	roomTable,
	sessionFormatTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { placementTable } from '$lib/server/db/conference/program-schema';
import { and, asc, eq, sql } from 'drizzle-orm';

/**
 * What one batch did: the names that landed, the ones already on the list, and
 * the ids of the new rows in the order they were written.
 */
export type AddedNames = { added: string[]; skipped: string[]; ids: number[] };

/** Nothing to do — an empty field, or a block of nothing but blank lines. */
const EMPTY: AddedNames = { added: [], skipped: [], ids: [] };

export type ConfigList = {
	rooms: { id: number; name: string; position: number }[];
	tracks: { id: number; name: string; position: number }[];
	formats: { id: number; name: string; minutes: number | null; position: number }[];
};

export async function conferenceConfig(conferenceId: number): Promise<ConfigList> {
	const [rooms, tracks, formats] = await Promise.all([
		db
			.select({ id: roomTable.id, name: roomTable.name, position: roomTable.position })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conferenceId))
			.orderBy(asc(roomTable.position), asc(roomTable.id)),
		db
			.select({ id: trackTable.id, name: trackTable.name, position: trackTable.position })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId))
			.orderBy(asc(trackTable.position), asc(trackTable.id)),
		db
			.select({
				id: sessionFormatTable.id,
				name: sessionFormatTable.name,
				minutes: sessionFormatTable.minutes,
				position: sessionFormatTable.position
			})
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId))
			.orderBy(asc(sessionFormatTable.position), asc(sessionFormatTable.id))
	]);

	return { rooms, tracks, formats };
}

/**
 * Which of these names are new, and where the new ones go.
 *
 * A name already on the list is skipped rather than added a second time. None of
 * these tables has a unique index on the name, so a repeated submit used to leave
 * two rooms called "Main Stage" — and on the agenda grid there is then no way to
 * say which one a session is in. Skipping is also what makes a second submit of
 * the same block harmless: an organizer who is not sure the first one arrived can
 * simply send it again.
 *
 * Case-insensitive, because "Main stage" and "Main Stage" are the same room to
 * everyone except a database.
 *
 * The block has already been de-duplicated against itself by the parser; this is
 * only about what is in the conference already.
 */
function plan(names: string[], rows: { name: string; position: number }[]) {
	const taken = new Set(rows.map((row) => row.name.trim().toLowerCase()));
	const next = rows.reduce((highest, row) => Math.max(highest, row.position), -1) + 1;

	const fresh = names.filter((name) => !taken.has(name.toLowerCase()));
	const skipped = names.filter((name) => taken.has(name.toLowerCase()));

	return { fresh, skipped, next };
}

/**
 * Add every room named in the block, in one submit and one transaction.
 *
 * One transaction rather than a loop of inserts: positions are numbered from the
 * highest one already there, and two organizers pasting at the same moment would
 * otherwise interleave and give two rooms the same column.
 */
export async function addRooms(conferenceId: number, block: string): Promise<AddedNames> {
	const names = parseNames(block);
	if (names.length === 0) return EMPTY;

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ name: roomTable.name, position: roomTable.position })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conferenceId));

		const { fresh, skipped, next } = plan(names, rows);
		if (fresh.length === 0) return { added: fresh, skipped, ids: [] };

		const created = await tx
			.insert(roomTable)
			.values(fresh.map((name, i) => ({ conferenceId, name, position: next + i })))
			.returning({ id: roomTable.id });

		return { added: fresh, skipped, ids: created.map((row) => row.id) };
	});
}

export async function addTracks(conferenceId: number, block: string): Promise<AddedNames> {
	const names = parseNames(block);
	if (names.length === 0) return EMPTY;

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ name: trackTable.name, position: trackTable.position })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId));

		const { fresh, skipped, next } = plan(names, rows);
		if (fresh.length === 0) return { added: fresh, skipped, ids: [] };

		const created = await tx
			.insert(trackTable)
			.values(fresh.map((name, i) => ({ conferenceId, name, position: next + i })))
			.returning({ id: trackTable.id });

		return { added: fresh, skipped, ids: created.map((row) => row.id) };
	});
}

/**
 * Session format = public shape of a proposal (Keynote, Talk, Workshop, …).
 * `minutes` drives agenda end times; null means the organizer has not set a length.
 *
 * A line the parser rejected stops the whole submit: half a pasted list is worse
 * than none, because the organizer then has to work out which half landed.
 */
export async function addFormats(
	conferenceId: number,
	block: string
): Promise<AddedNames | { problem: string }> {
	const parsed = parseFormatLines(block);
	if (!parsed.ok) return { problem: parsed.problem };
	if (parsed.formats.length === 0) return EMPTY;

	const lengths = new Map<string, number | null>(
		parsed.formats.map((format: FormatLine) => [format.name.toLowerCase(), format.minutes])
	);

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ name: sessionFormatTable.name, position: sessionFormatTable.position })
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId));

		const { fresh, skipped, next } = plan(
			parsed.formats.map((format) => format.name),
			rows
		);
		if (fresh.length === 0) return { added: fresh, skipped, ids: [] };

		const created = await tx
			.insert(sessionFormatTable)
			.values(
				fresh.map((name, i) => ({
					conferenceId,
					name,
					minutes: lengths.get(name.toLowerCase()) ?? null,
					position: next + i
				}))
			)
			.returning({ id: sessionFormatTable.id });

		return { added: fresh, skipped, ids: created.map((row) => row.id) };
	});
}

/**
 * One room, by name — the shape the agenda code has always used (AIA-02).
 *
 * A thin call into the batch above rather than a second writer: two paths that
 * both create rooms would be two sets of rules about duplicates and positions.
 */
export async function addRoom(conferenceId: number, name: string): Promise<number | null> {
	const { ids } = await addRooms(conferenceId, oneLine(name));
	return ids[0] ?? null;
}

export async function addTrack(conferenceId: number, name: string): Promise<number | null> {
	const { ids } = await addTracks(conferenceId, oneLine(name));
	return ids[0] ?? null;
}

export async function addFormat(
	conferenceId: number,
	name: string,
	minutes: number | null
): Promise<number | null> {
	if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES)) {
		return null;
	}

	const line = minutes === null ? oneLine(name) : `${oneLine(name)}, ${minutes}`;
	const result = await addFormats(conferenceId, line);
	return 'problem' in result ? null : (result.ids[0] ?? null);
}

/** A single name as a one-line block, with any newlines in it taken out. */
function oneLine(name: string): string {
	return name.replace(/\n/g, ' ').trim().slice(0, MAX_NAME);
}

/**
 * What a rename or a removal ran into, in the words the form prints back.
 * `null` means it went through.
 */
export type ConfigProblem = string | null;

/*
 * Renaming and removing, the other two thirds of a list (#119).
 *
 * Adding was the only thing the settings page could do to a room, a track or a
 * format. A typo was therefore permanent, and so was a room the venue took back.
 *
 * The two verbs are deliberately not symmetric. A rename is always allowed: the
 * id every session and submission points at does not move, so "Room 3C" becoming
 * "Hall C" is the same room under a new sign. A removal is refused while anything
 * still points at the row, because the foreign keys are `on delete set null` or
 * `cascade` — deleting a booked room would not fail, it would quietly clear the
 * room off every session scheduled in it, and the organizer would find that out
 * on the grid days later. Refusing and naming the count is the whole of the
 * feature: "what happens to what I already have" is the question this page has
 * to answer before anybody dares press Remove.
 */

/** A row of one of the three lists, as the name rules need to see it. */
type NamedRow = { id: number; name: string };

/**
 * The rules a new name has to pass: not empty, the row still exists, and no
 * sibling already carries it.
 *
 * Case-insensitive against the siblings, matching what `plan()` does on the way
 * in — two rooms called "Main Stage" are unusable on the agenda grid whether the
 * second one arrived by adding or by renaming.
 */
function renamed(
	rows: NamedRow[],
	id: number,
	raw: string,
	noun: string
): { ok: true; name: string } | { ok: false; problem: string } {
	const name = oneLine(raw);
	if (!name) return { ok: false, problem: `Give the ${noun} a name.` };

	if (!rows.some((row) => row.id === id)) return { ok: false, problem: `That ${noun} is gone.` };

	const taken = rows.some(
		(row) => row.id !== id && row.name.trim().toLowerCase() === name.toLowerCase()
	);
	if (taken) return { ok: false, problem: `There is already a ${noun} called "${name}".` };

	return { ok: true, name };
}

/** `count(*)` as a number rather than the string the driver hands back. */
const COUNT = { count: sql<number>`count(*)::int` };

/** "1 session" / "3 sessions" — a count that reads like a sentence. */
function plural(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export async function renameRoom(
	conferenceId: number,
	roomId: number,
	raw: string
): Promise<ConfigProblem> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: roomTable.id, name: roomTable.name })
			.from(roomTable)
			.where(eq(roomTable.conferenceId, conferenceId));

		const check = renamed(rows, roomId, raw, 'room');
		if (!check.ok) return check.problem;

		await tx
			.update(roomTable)
			.set({ name: check.name })
			.where(and(eq(roomTable.id, roomId), eq(roomTable.conferenceId, conferenceId)));
		return null;
	});
}

export async function renameTrack(
	conferenceId: number,
	trackId: number,
	raw: string
): Promise<ConfigProblem> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: trackTable.id, name: trackTable.name })
			.from(trackTable)
			.where(eq(trackTable.conferenceId, conferenceId));

		const check = renamed(rows, trackId, raw, 'track');
		if (!check.ok) return check.problem;

		await tx
			.update(trackTable)
			.set({ name: check.name })
			.where(and(eq(trackTable.id, trackId), eq(trackTable.conferenceId, conferenceId)));
		return null;
	});
}

/**
 * A format carries a length as well as a name, so its edit takes both.
 *
 * The length is validated the same way the parser validates `Workshop, 90`, and
 * an empty field means "no length set" rather than zero — a format with a length
 * of nothing is a format nobody has measured yet, which is a real state.
 */
export async function updateFormat(
	conferenceId: number,
	formatId: number,
	raw: string,
	minutes: number | null
): Promise<ConfigProblem> {
	if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES)) {
		return `Minutes must be a whole number between 1 and ${MAX_MINUTES}, or empty.`;
	}

	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: sessionFormatTable.id, name: sessionFormatTable.name })
			.from(sessionFormatTable)
			.where(eq(sessionFormatTable.conferenceId, conferenceId));

		const check = renamed(rows, formatId, raw, 'session format');
		if (!check.ok) return check.problem;

		await tx
			.update(sessionFormatTable)
			.set({ name: check.name, minutes })
			.where(
				and(eq(sessionFormatTable.id, formatId), eq(sessionFormatTable.conferenceId, conferenceId))
			);
		return null;
	});
}

/**
 * A room goes only when nothing is scheduled in it.
 *
 * `placement.room_id` is `on delete set null`, so the database would take the
 * delete happily and hand back an agenda full of sessions in no room at all.
 */
export async function removeRoom(conferenceId: number, roomId: number): Promise<ConfigProblem> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: roomTable.id })
			.from(roomTable)
			.where(and(eq(roomTable.id, roomId), eq(roomTable.conferenceId, conferenceId)));
		if (!row) return 'That room is gone.';

		const [{ count: scheduled }] = await tx
			.select(COUNT)
			.from(placementTable)
			.where(eq(placementTable.roomId, roomId));
		if (scheduled > 0) {
			return `${plural(scheduled, 'session')} on the agenda ${scheduled === 1 ? 'is' : 'are'} in this room. Move ${scheduled === 1 ? 'it' : 'them'} on the agenda first — removing the room here would leave ${scheduled === 1 ? 'it' : 'them'} scheduled nowhere.`;
		}

		await tx
			.delete(roomTable)
			.where(and(eq(roomTable.id, roomId), eq(roomTable.conferenceId, conferenceId)));
		return null;
	});
}

/**
 * A track goes only when no submission carries it and no reviewer is narrowed to
 * it.
 *
 * The second check is the less obvious one and matters more: `membership_track`
 * cascades, so deleting a track a reviewer was limited to would delete their
 * narrowing too — and a reviewer with no narrowing left sees every track. A
 * removal in settings must not quietly widen somebody's access.
 */
export async function removeTrack(conferenceId: number, trackId: number): Promise<ConfigProblem> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: trackTable.id })
			.from(trackTable)
			.where(and(eq(trackTable.id, trackId), eq(trackTable.conferenceId, conferenceId)));
		if (!row) return 'That track is gone.';

		const [{ count: submissions }] = await tx
			.select(COUNT)
			.from(submissionTable)
			.where(eq(submissionTable.trackId, trackId));
		if (submissions > 0) {
			return `${plural(submissions, 'submission')} ${submissions === 1 ? 'is' : 'are'} in this track. Move ${submissions === 1 ? 'it' : 'them'} to another track first — removing it here would leave ${submissions === 1 ? 'it' : 'them'} with no track at all.`;
		}

		const [{ count: reviewers }] = await tx
			.select(COUNT)
			.from(membershipTrackTable)
			.where(eq(membershipTrackTable.trackId, trackId));
		if (reviewers > 0) {
			return `${plural(reviewers, 'reviewer')} ${reviewers === 1 ? 'is' : 'are'} limited to this track. Change that under Reviewer pool first — removing the track here would widen them to every track instead.`;
		}

		await tx
			.delete(trackTable)
			.where(and(eq(trackTable.id, trackId), eq(trackTable.conferenceId, conferenceId)));
		return null;
	});
}

/** A format goes only when no submission was proposed as one. */
export async function removeFormat(conferenceId: number, formatId: number): Promise<ConfigProblem> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: sessionFormatTable.id })
			.from(sessionFormatTable)
			.where(
				and(eq(sessionFormatTable.id, formatId), eq(sessionFormatTable.conferenceId, conferenceId))
			);
		if (!row) return 'That session format is gone.';

		const [{ count: submissions }] = await tx
			.select(COUNT)
			.from(submissionTable)
			.where(eq(submissionTable.sessionFormatId, formatId));
		if (submissions > 0) {
			return `${plural(submissions, 'submission')} ${submissions === 1 ? 'was' : 'were'} proposed as this format. Change ${submissions === 1 ? 'it' : 'them'} first — removing it here would leave ${submissions === 1 ? 'it' : 'them'} with no format at all.`;
		}

		await tx
			.delete(sessionFormatTable)
			.where(
				and(eq(sessionFormatTable.id, formatId), eq(sessionFormatTable.conferenceId, conferenceId))
			);
		return null;
	});
}
