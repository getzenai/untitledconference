/**
 * Local board writes for the agenda grid (#597).
 *
 * A drop has to paint in the same frame as the pointer comes up. Clash badges
 * and capacity wait for the server — this module only moves rows the organizer
 * already has. Dropping a write from the list is the rollback: the next derive
 * is the server board again.
 *
 * A draft dragged onto a second slot currently becomes a *new* placement on
 * the server (#559). We cannot invent that id, so a drop is always a move
 * here. #596 will pass move-vs-alternative as an intent; alternative stays
 * server-owned until then.
 */

export type OptimisticSession = {
	placementId: number;
	minutes: number;
	dayId: number | null;
	roomId: number | null;
	startMinutes: number | null;
	endMinutes: number | null;
	status: string;
};

export type BoardWrite =
	| {
			kind: 'place';
			placementId: number;
			dayId: number;
			roomId: number;
			startMinutes: number;
	  }
	| { kind: 'unplace'; placementId: number }
	| { kind: 'swap'; placementId: number; withPlacementId: number };

export function involvedPlacementIds(write: BoardWrite): number[] {
	return write.kind === 'swap' ? [write.placementId, write.withPlacementId] : [write.placementId];
}

/**
 * The slot editor's `?/place` of a talk already on the grid is "keep both"
 * (#559): a second row the server allocates. We do not paint that locally.
 */
export function slotEditorWrite(
	actionName: string,
	fields: {
		placementId: number;
		withPlacementId?: number;
		dayId?: number;
		roomId?: number;
		startMinutes?: number;
	},
	source: 'tray' | 'grid' | 'missing'
): BoardWrite | null {
	if (actionName === 'unplace') return { kind: 'unplace', placementId: fields.placementId };
	if (actionName === 'swap' && fields.withPlacementId !== undefined) {
		return {
			kind: 'swap',
			placementId: fields.placementId,
			withPlacementId: fields.withPlacementId
		};
	}
	if (
		actionName === 'place' &&
		source === 'tray' &&
		fields.dayId !== undefined &&
		fields.roomId !== undefined &&
		fields.startMinutes !== undefined
	) {
		return {
			kind: 'place',
			placementId: fields.placementId,
			dayId: fields.dayId,
			roomId: fields.roomId,
			startMinutes: fields.startMinutes
		};
	}
	return null;
}

export function applyBoardWrites<S extends OptimisticSession, B extends { placed: S[]; tray: S[] }>(
	board: B,
	writes: readonly BoardWrite[]
): B {
	return writes.reduce((next, write) => applyOne(next, write), board);
}

function applyOne<S extends OptimisticSession, B extends { placed: S[]; tray: S[] }>(
	board: B,
	write: BoardWrite
): B {
	if (write.kind === 'place') return applyPlace(board, write);
	if (write.kind === 'unplace') return applyUnplace(board, write.placementId);
	return applySwap(board, write.placementId, write.withPlacementId);
}

function applyPlace<S extends OptimisticSession, B extends { placed: S[]; tray: S[] }>(
	board: B,
	write: Extract<BoardWrite, { kind: 'place' }>
): B {
	const session =
		board.tray.find((s) => s.placementId === write.placementId) ??
		board.placed.find((s) => s.placementId === write.placementId);
	if (!session) return board;

	const moved: S = {
		...session,
		dayId: write.dayId,
		roomId: write.roomId,
		startMinutes: write.startMinutes,
		endMinutes: write.startMinutes + session.minutes
	};

	return {
		...board,
		tray: board.tray.filter((s) => s.placementId !== write.placementId),
		placed: [...board.placed.filter((s) => s.placementId !== write.placementId), moved]
	};
}

function applyUnplace<S extends OptimisticSession, B extends { placed: S[]; tray: S[] }>(
	board: B,
	placementId: number
): B {
	const session = board.placed.find((s) => s.placementId === placementId);
	if (!session) return board;

	const waiting: S = {
		...session,
		dayId: null,
		roomId: null,
		startMinutes: null,
		endMinutes: null,
		status: 'tentative'
	};

	return {
		...board,
		placed: board.placed.filter((s) => s.placementId !== placementId),
		tray: [...board.tray.filter((s) => s.placementId !== placementId), waiting]
	};
}

function applySwap<S extends OptimisticSession, B extends { placed: S[]; tray: S[] }>(
	board: B,
	placementId: number,
	withPlacementId: number
): B {
	const a = board.placed.find((s) => s.placementId === placementId);
	const b = board.placed.find((s) => s.placementId === withPlacementId);
	if (!a || !b || a.startMinutes === null || b.startMinutes === null) return board;

	// Each talk keeps its own length — same rule as `swapPlacements`.
	const movedA: S = {
		...a,
		dayId: b.dayId,
		roomId: b.roomId,
		startMinutes: b.startMinutes,
		endMinutes: b.startMinutes + a.minutes
	};
	const movedB: S = {
		...b,
		dayId: a.dayId,
		roomId: a.roomId,
		startMinutes: a.startMinutes,
		endMinutes: a.startMinutes + b.minutes
	};

	return {
		...board,
		placed: board.placed.map((s) => {
			if (s.placementId === placementId) return movedA;
			if (s.placementId === withPlacementId) return movedB;
			return s;
		})
	};
}
