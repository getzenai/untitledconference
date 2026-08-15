/**
 * Layout arithmetic for the public agenda's room grid.
 *
 * The grid's axis is fixed on purpose: 1.5rem per quarter hour, so a card's
 * height is a claim about its length. Everything here adapts the *content* to
 * that height rather than the other way round (#588).
 */

/** One row of the grid, in pixels: `1.5rem` at the default root size. */
const ROW_PX = 24;
/** The grid's `gap-px` between rows, and the card's own `m-px` on each side. */
const GAP_PX = 1;

/**
 * How much room a card of `rows` rows really has for text.
 *
 * Rows are separated by a 1px gap that a spanning card gets to keep, and the
 * card insets itself by 1px on each side, so the box is not `rows * 24`.
 */
export function cardHeightPx(rows: number): number {
	return rows * ROW_PX + (rows - 1) * GAP_PX - 2 * GAP_PX;
}

/**
 * How dense a card has to be to fit its own height.
 *
 * - `tiny` — one row, 22px. `text-sm leading-tight` alone needs 17.5px and the
 *   normal 4px padding puts it over, so the glyphs were cut through the middle:
 *   one smaller line, no padding above or below, ellipsis instead of a
 *   half-visible descender.
 * - `compact` — two rows, 47px. Two clamped `text-sm` lines (35px) fit inside
 *   4px padding; the meta line does not, so it is dropped rather than clipped.
 * - `full` — three rows or more: title, meta, normal padding.
 *
 * The tooltip and the detail page carry everything a card leaves out, which is
 * why shortening is safe and clipping is not.
 */
export type CardDensity = 'tiny' | 'compact' | 'full';

export function cardDensity(rows: number): CardDensity {
	if (rows <= 1) return 'tiny';
	if (rows <= 2) return 'compact';
	return 'full';
}

/**
 * The first label line of the gutter, rounded down to a round clock time.
 *
 * The frame starts at the day's earliest session, which is rarely round: an
 * agenda opening at 09:05 was labelled 09:05 / 09:35 / 10:05, and a visitor
 * reads those lines as the grid's rhythm rather than as one talk's start.
 * Flooring moves the frame, never a card — every card keeps its own timestamp.
 *
 * Times are formatted in UTC (see `public-view`), and the epoch is UTC
 * midnight, so flooring the epoch millisecond floors the wall clock too.
 */
export function floorToLabel(ms: number, labelMinutes: number): number {
	const step = labelMinutes * 60_000;
	return Math.floor(ms / step) * step;
}

/**
 * Which lane a session takes when two talks share a room and a minute.
 *
 * A room column gives every session its full width, so an overlap drew one
 * title on top of the other and made both unreadable. Calendars solve this by
 * splitting the column, and so do we: sessions that overlap — directly or
 * through a chain of neighbours — form a cluster, and the cluster's widest
 * moment decides how many lanes the column is cut into.
 *
 * A cluster of one is the whole column, which is why a day without overlaps
 * looks exactly as it did before. Room-less sessions (plenary, lunch) span
 * every column and are left alone: they are the day's frame, not a clash.
 */
export type Lane = { lane: number; lanes: number };

export function assignLanes<
	T extends { id: string; roomId: string | null; start: Date; end: Date }
>(sessions: T[]): Map<string, Lane> {
	const byRoom = new Map<string, T[]>();
	for (const session of sessions) {
		if (!session.roomId) continue;
		const room = byRoom.get(session.roomId);
		if (room) room.push(session);
		else byRoom.set(session.roomId, [session]);
	}

	const result = new Map<string, Lane>();
	for (const room of byRoom.values()) {
		const ordered = [...room].sort(
			(a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime()
		);

		// One cluster at a time: while a session starts before everything seen so
		// far has ended, it belongs to the same split column.
		let cluster: T[] = [];
		let clusterEnd = -Infinity;
		const flush = () => {
			if (cluster.length > 0) assignCluster(cluster, result);
			cluster = [];
			clusterEnd = -Infinity;
		};
		for (const session of ordered) {
			if (session.start.getTime() >= clusterEnd) flush();
			cluster.push(session);
			clusterEnd = Math.max(clusterEnd, session.end.getTime());
		}
		flush();
	}
	return result;
}

function assignCluster<T extends { id: string; start: Date; end: Date }>(
	cluster: T[],
	out: Map<string, Lane>
): void {
	// Greedy: the first lane whose last talk has ended. Same order as the grid
	// reads, so the earlier talk keeps the left-hand lane.
	const laneEnds: number[] = [];
	const lanes: number[] = [];
	for (const session of cluster) {
		let lane = laneEnds.findIndex((end) => end <= session.start.getTime());
		if (lane < 0) {
			lane = laneEnds.length;
			laneEnds.push(0);
		}
		laneEnds[lane] = session.end.getTime();
		lanes.push(lane);
	}
	const width = laneEnds.length;
	cluster.forEach((session, i) => out.set(session.id, { lane: lanes[i], lanes: width }));
}

/**
 * The inline geometry that puts a card in its lane.
 *
 * Percentages resolve against the grid area, i.e. the room column, so the
 * arithmetic survives the column being `1fr` at four rooms and `9rem` at
 * thirty. `null` for a column nobody shares — the card keeps the `m-px` box it
 * has always had, and an unsplit day renders byte-identically.
 */
export function laneStyle(lane: Lane | undefined): string | null {
	if (!lane || lane.lanes <= 1) return null;
	const width = `calc(100% / ${lane.lanes} - 2px)`;
	const offset = `calc(100% * ${lane.lane} / ${lane.lanes} + 1px)`;
	return `width: ${width}; margin-left: ${offset}; margin-right: 0;`;
}
