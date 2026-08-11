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
import {
	roomTable,
	sessionFormatTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { asc, eq } from 'drizzle-orm';

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
