/**
 * Conference-level configuration: rooms, tracks, session formats.
 *
 * These used to be half-buried (rooms/tracks only on the agenda builder; formats
 * nowhere). They belong on the conference settings surface (#63), not on the
 * scheduling grid.
 */
import { db } from '$lib/server/db';
import {
	roomTable,
	sessionFormatTable,
	trackTable
} from '$lib/server/db/conference/conference-schema';
import { asc, eq, sql } from 'drizzle-orm';

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

export async function addRoom(conferenceId: number, name: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [{ next }] = await db
		.select({ next: sql<number>`coalesce(max(${roomTable.position}), -1) + 1` })
		.from(roomTable)
		.where(eq(roomTable.conferenceId, conferenceId));

	const [created] = await db
		.insert(roomTable)
		.values({ conferenceId, name: trimmed.slice(0, 120), position: next })
		.returning({ id: roomTable.id });

	return created.id;
}

export async function addTrack(conferenceId: number, name: string): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const [{ next }] = await db
		.select({ next: sql<number>`coalesce(max(${trackTable.position}), -1) + 1` })
		.from(trackTable)
		.where(eq(trackTable.conferenceId, conferenceId));

	const [created] = await db
		.insert(trackTable)
		.values({ conferenceId, name: trimmed.slice(0, 120), position: next })
		.returning({ id: trackTable.id });

	return created.id;
}

/**
 * Session format = public shape of a proposal (Keynote, Talk, Workshop, …).
 * `minutes` drives agenda end times; null means the organizer has not set a length.
 */
export async function addFormat(
	conferenceId: number,
	name: string,
	minutes: number | null
): Promise<number | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;
	if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60)) {
		return null;
	}

	const [{ next }] = await db
		.select({ next: sql<number>`coalesce(max(${sessionFormatTable.position}), -1) + 1` })
		.from(sessionFormatTable)
		.where(eq(sessionFormatTable.conferenceId, conferenceId));

	const [created] = await db
		.insert(sessionFormatTable)
		.values({
			conferenceId,
			name: trimmed.slice(0, 120),
			minutes,
			position: next
		})
		.returning({ id: sessionFormatTable.id });

	return created.id;
}
