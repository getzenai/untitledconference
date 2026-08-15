/**
 * The arithmetic behind the organizer's agenda calendar.
 *
 * Two questions, both pure, both kept out of the component on purpose:
 *
 *  1. **Which rows does this session cover?** A block's height is a claim about its
 *     length, so it has to come from the times rather than from a fixed card size.
 *  2. **Which slot is the pointer over?** Drag-and-drop needs a room and a start
 *     time out of a coordinate, and reading that off the DOM with
 *     `elementFromPoint` would consult a document that has the drag image sitting
 *     in the way. Rectangles and division answer it without touching the DOM, which
 *     is also the only reason it can be tested without a browser.
 *
 * The grid is drawn in minutes from midnight, in the conference's own clock — the
 * same units `agenda.ts` stores and `?/place` accepts. Nothing here converts to a
 * Date, so nothing here can shift a session by the reader's timezone.
 */

/** The frame a day is drawn in: which rooms are columns, which minutes are rows. */
export type GridFrame = {
	/** Room ids in column order, left to right. */
	rooms: number[];
	/** The start minute of each row, top to bottom. Uniform steps of `slotMinutes`. */
	slots: number[];
	slotMinutes: number;
};

/**
 * The rows a day needs.
 *
 * The working day (`09:00–18:00`) is the floor rather than the whole story: a
 * session seeded outside those hours still has to be visible and draggable, and a
 * grid that stopped at 18:00 would simply not draw it. So the frame is the working
 * day widened to contain everything already placed — never narrowed, because an
 * empty day still needs slots to drop the first talk into.
 */
export function gridSlots(options: {
	dayStartsAt: number;
	dayEndsAt: number;
	slotMinutes: number;
	sessions: { startMinutes: number | null; endMinutes: number | null }[];
}): number[] {
	const { dayStartsAt, dayEndsAt, slotMinutes } = options;

	let first = dayStartsAt;
	let last = dayEndsAt;
	for (const s of options.sessions) {
		if (s.startMinutes !== null) first = Math.min(first, s.startMinutes);
		if (s.endMinutes !== null) last = Math.max(last, s.endMinutes);
		if (s.startMinutes !== null) last = Math.max(last, s.startMinutes + slotMinutes);
	}

	// Snap outwards so a session that starts at 08:52 gets a row that contains it
	// rather than one that starts after it.
	const floor = Math.floor(first / slotMinutes) * slotMinutes;
	const ceil = Math.ceil(last / slotMinutes) * slotMinutes;

	const slots: number[] = [];
	for (let m = floor; m < ceil; m += slotMinutes) slots.push(m);
	return slots;
}

/**
 * Where a session sits in the frame: a 1-based row and how many rows it covers.
 *
 * A session with no end time gets one row rather than none. That is the shape a
 * placement takes for the moment between "has a start" and "has a length", and a
 * block that renders as zero rows is a block nobody can grab to fix it.
 */
export function blockRows(
	frame: GridFrame,
	session: { startMinutes: number | null; endMinutes: number | null }
): { row: number; span: number } | null {
	if (session.startMinutes === null || frame.slots.length === 0) return null;

	const first = frame.slots[0];
	const row = Math.floor((session.startMinutes - first) / frame.slotMinutes) + 1;
	if (row < 1 || row > frame.slots.length) return null;

	const end = session.endMinutes ?? session.startMinutes + frame.slotMinutes;
	const endRow = Math.ceil((end - first) / frame.slotMinutes) + 1;

	// Clamped to the frame: `gridSlots` widens for anything placed, but a session
	// dropped and re-read mid-flight should still never draw past the last row.
	return { row, span: Math.max(1, Math.min(endRow, frame.slots.length + 1) - row) };
}

/**
 * Side-by-side lanes for sessions that overlap in one room.
 *
 * Without this a double-booking is drawn as two blocks in the same place, and the
 * second one hides the first. That is the worst possible answer to a clash: the
 * conflict warning would name two sessions and the grid would show one, on the
 * screen whose whole job is to make the overlap visible.
 *
 * Lanes are assigned per cluster of transitively overlapping sessions, so one
 * clash at 09:00 does not narrow the whole day. Within a cluster a session takes
 * the first lane whose previous occupant has already ended, which is the usual
 * calendar behaviour: neighbours stay next to each other rather than drifting
 * right.
 *
 * The returned `lane`/`lanes` pair is a fraction of the column, not pixels — the
 * column's width is the browser's business.
 */
export function laneLayout<T extends { startMinutes: number | null; endMinutes: number | null }>(
	sessions: T[]
): { session: T; lane: number; lanes: number }[] {
	const ordered = sessions
		.map((session, index) => ({
			session,
			index,
			start: session.startMinutes ?? 0,
			// A session with no end still occupies its start, or it would overlap
			// nothing and sit under whatever begins at the same minute.
			end: session.endMinutes ?? (session.startMinutes ?? 0) + 1
		}))
		.sort((a, b) => a.start - b.start || a.index - b.index);

	const out: { session: T; lane: number; lanes: number }[] = [];
	let cluster: { session: T; lane: number }[] = [];
	let clusterEnd = -Infinity;
	let laneEnds: number[] = [];

	const flush = () => {
		for (const entry of cluster) out.push({ ...entry, lanes: laneEnds.length || 1 });
		cluster = [];
		laneEnds = [];
	};

	for (const item of ordered) {
		// A gap with nothing running through it ends the cluster: what follows
		// cannot overlap anything before it.
		if (item.start >= clusterEnd) {
			flush();
			clusterEnd = -Infinity;
		}

		let lane = laneEnds.findIndex((end) => end <= item.start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.end);
		} else {
			laneEnds[lane] = item.end;
		}

		cluster.push({ session: item.session, lane });
		clusterEnd = Math.max(clusterEnd, item.end);
	}
	flush();

	return out;
}

/** The screen rectangle the room columns occupy — the time gutter is not part of it. */
export type GridBox = { left: number; top: number; width: number; height: number };

/**
 * The slot under a pointer, or null when the pointer is off the grid.
 *
 * Null means "no drop", not "nearest slot". A drag that ends over the tray, the
 * page header or another day's tab has no obvious intent, and guessing one moves a
 * talk somewhere nobody asked for — the one outcome a scheduling screen must not
 * produce by accident.
 */
export function dropTarget(
	frame: GridFrame,
	box: GridBox,
	point: { x: number; y: number }
): { roomId: number; startMinutes: number } | null {
	if (frame.rooms.length === 0 || frame.slots.length === 0) return null;
	if (box.width <= 0 || box.height <= 0) return null;

	if (point.x < box.left || point.x > box.left + box.width) return null;
	if (point.y < box.top || point.y > box.top + box.height) return null;

	const column = Math.min(
		frame.rooms.length - 1,
		Math.floor(((point.x - box.left) / box.width) * frame.rooms.length)
	);
	const row = Math.min(
		frame.slots.length - 1,
		Math.floor(((point.y - box.top) / box.height) * frame.slots.length)
	);

	return { roomId: frame.rooms[column], startMinutes: frame.slots[row] };
}

/**
 * A hold covers a slot when it runs through that minute in that room.
 *
 * `roomId === null` is every column — lunch, a keynote, the thing that is not
 * free even though no talk sits there. A talk is never a hold: overlapping
 * talks are how a room clash is *made* (AIA-05), and greying those out would
 * close the only path an agent has to produce one. Dropping onto a hold is
 * the opposite: the time is already spoken for (#560).
 */
export function isHoldKind(kind: string): boolean {
	return kind === 'block' || kind === 'reservation';
}

export function holdCoversSlot(
	hold: {
		kind: string;
		roomId: number | null;
		startMinutes: number | null;
		endMinutes: number | null;
	},
	slot: { roomId: number; startMinutes: number }
): boolean {
	if (!isHoldKind(hold.kind)) return false;
	if (hold.startMinutes === null) return false;
	const end = hold.endMinutes ?? hold.startMinutes + 1;
	if (slot.startMinutes < hold.startMinutes || slot.startMinutes >= end) return false;
	return hold.roomId === null || hold.roomId === slot.roomId;
}

/** Timed holds with no room — they span every column, like the public agenda. */
export function spanningHolds<
	T extends { kind: string; roomId: number | null; startMinutes: number | null }
>(sessions: T[]): T[] {
	return sessions.filter((s) => isHoldKind(s.kind) && s.roomId === null && s.startMinutes !== null);
}

/** Holds that have no time yet, so the grid has nowhere to put them. */
export function untimedHolds<T extends { kind: string; startMinutes: number | null }>(
	sessions: T[]
): T[] {
	return sessions.filter((s) => isHoldKind(s.kind) && s.startMinutes === null);
}

/**
 * What a drop would land on: a session that *starts* here, or a hold that
 * covers here. Mid-talk coverage is not an occupant — that is still a free
 * drop that becomes a visible clash. A hold covering the minute is taken.
 */
export function dropOccupant<
	T extends {
		kind: string;
		roomId: number | null;
		startMinutes: number | null;
		endMinutes: number | null;
	}
>(sessions: T[], slot: { roomId: number; startMinutes: number }): T | null {
	const starting =
		sessions.find((s) => s.roomId === slot.roomId && s.startMinutes === slot.startMinutes) ?? null;
	if (starting) return starting;
	return sessions.find((s) => holdCoversSlot(s, slot)) ?? null;
}
