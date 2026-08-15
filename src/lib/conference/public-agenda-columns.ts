/**
 * Which rooms earn a column on the public agenda for one day.
 *
 * The organizer's room list is a place to drop talks, including rooms that
 * never get one. On the visitor's grid those empty columns are just width —
 * on a phone, sideways scroll past nothing (#561). A room used only on day 2
 * therefore does not widen day 1.
 *
 * Order is the organizer's: first appearance in `rooms`, not first talk of the
 * day. Room-less sessions (plenary, lunch) do not create a column; they span
 * whatever columns the day has.
 */

export const ROOM_COLUMN_MIN = '9rem';

export function occupiedRoomsForDay<R extends { id: string }>(
	rooms: R[],
	sessions: { roomId: string | null }[]
): R[] {
	const used = new Set<string>();
	for (const session of sessions) {
		if (session.roomId) used.add(session.roomId);
	}
	return rooms.filter((room) => used.has(room.id));
}

/**
 * CSS grid columns for the public agenda: a time gutter plus one track per
 * occupied room. A day of only plenaries still needs one content column, or a
 * room-less session would span `2 / 2` and occupy nothing.
 */
export function agendaGridColumns(roomCount: number): string {
	return `4.5rem repeat(${Math.max(roomCount, 1)}, minmax(${ROOM_COLUMN_MIN}, 1fr))`;
}

/**
 * Where a session sits: column 1 is the time gutter, 2… are rooms.
 *
 * No `roomId` means every room column of the day — that is how a plenary or a
 * break is meant to read, rather than being dropped for lack of a column.
 */
export function sessionColumnSpan(
	session: { roomId: string | null },
	rooms: { id: string }[]
): { start: number; end: number } {
	const width = Math.max(rooms.length, 1);
	if (!session.roomId) return { start: 2, end: width + 2 };
	const i = rooms.findIndex((room) => room.id === session.roomId);
	if (i < 0) return { start: 2, end: width + 2 };
	return { start: i + 2, end: i + 3 };
}
