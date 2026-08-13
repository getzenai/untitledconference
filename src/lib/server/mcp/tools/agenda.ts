/**
 * Agenda tools (#300). Each one calls the same function the screen calls —
 * agendaBoard, addRoom, placeSession, unplaceSession, swapPlacements.
 *
 * One intentional deviation from the screen lives in refuseCollision below:
 * the builder lets clashes land (AIA-05); an agent gets the refusal instead.
 */
import {
	addRoom,
	agendaBoard,
	placeSession,
	swapPlacements,
	unplaceSession,
	type AgendaBoard,
	type BoardSession,
	type Conflict
} from '$lib/server/conference/agenda';
import { z } from 'zod';
import type { McpContext } from '../context';
import { organizerConference } from '../organizer';
import { McpToolError, type AnyMcpToolDefinition } from '../tool-helpers';

const slugField = z.string().min(1).describe('Conference slug, from list_my_conferences.');

const placementField = z
	.number()
	.int()
	.describe('Placement id, from get_agenda_tray or get_agenda.');

function formatClock(minutes: number | null): string | null {
	if (minutes === null) return null;
	const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
	const mm = String(minutes % 60).padStart(2, '0');
	return `${hh}:${mm}`;
}

function parseStart(start: string | undefined, startMinutes: number | undefined): number {
	if (startMinutes !== undefined) return startMinutes;
	if (!start) {
		throw new McpToolError('Pass start (HH:MM) or startMinutes.');
	}
	const match = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
	if (!match) {
		throw new McpToolError('start must be HH:MM (e.g. 09:00).');
	}
	const hours = Number(match[1]);
	const mins = Number(match[2]);
	if (hours > 23 || mins > 59) {
		throw new McpToolError('start must be HH:MM (e.g. 09:00).');
	}
	return hours * 60 + mins;
}

function resolveDay(
	board: AgendaBoard,
	day: string | undefined,
	dayId: number | undefined
): number {
	if (dayId !== undefined) {
		if (!board.days.some((row) => row.id === dayId)) {
			throw new McpToolError(`No day ${dayId} on this conference.`);
		}
		return dayId;
	}
	if (!day) {
		throw new McpToolError('Pass day (YYYY-MM-DD) or dayId.');
	}
	const found = board.days.find((row) => row.date === day);
	if (!found) {
		const known = board.days.map((row) => row.date).join(', ') || 'none';
		throw new McpToolError(`No day ${day} on this conference. The days are ${known}.`);
	}
	return found.id;
}

function findSession(board: AgendaBoard, placementId: number): BoardSession {
	const session = [...board.placed, ...board.tray].find((row) => row.placementId === placementId);
	if (!session) {
		throw new McpToolError(
			`No session ${placementId} on this conference. Call get_agenda_tray or get_agenda.`
		);
	}
	return session;
}

function slotView(session: BoardSession, board: AgendaBoard) {
	const day = board.days.find((row) => row.id === session.dayId);
	const room = board.rooms.find((row) => row.id === session.roomId);
	return {
		placementId: session.placementId,
		submissionId: session.submissionId,
		title: session.title,
		kind: session.kind,
		status: session.status,
		speakers: session.speakers,
		minutes: session.minutes,
		formatName: session.formatName,
		dayId: session.dayId,
		day: day?.date ?? null,
		roomId: session.roomId,
		room: room?.name ?? null,
		startMinutes: session.startMinutes,
		start: formatClock(session.startMinutes),
		endMinutes: session.endMinutes,
		end: formatClock(session.endMinutes)
	};
}

function previousSlot(session: BoardSession) {
	if (session.dayId === null || session.roomId === null || session.startMinutes === null) {
		return null;
	}
	return { dayId: session.dayId, roomId: session.roomId, startMinutes: session.startMinutes };
}

async function restoreSlot(
	conferenceId: number,
	placementId: number,
	previous: { dayId: number; roomId: number; startMinutes: number } | null
) {
	if (!previous) {
		await unplaceSession(conferenceId, placementId);
		return;
	}
	await placeSession(conferenceId, placementId, previous);
}

/**
 * The screen (`placeSession` / `swapPlacements`) lets collisions land and paints
 * a warning (AIA-05): a human sees the clash and moves on in the next click. An
 * agent does not see the grid, so the same write would leave it planning on a
 * state it believes is valid. Refuse here, name the other session (talk, room,
 * time), and roll the write back through the same screen functions so the board
 * matches what we report. Do not "fix" this back to the permissive screen rule.
 */
function colliding(board: AgendaBoard, placementIds: number[]): Conflict | undefined {
	return board.conflicts.find((clash) =>
		clash.placementIds.some((id) => placementIds.includes(id))
	);
}

function collisionMessage(ours: BoardSession, clash: Conflict, board: AgendaBoard): string {
	const otherId = clash.placementIds.find((id) => id !== ours.placementId) ?? clash.placementIds[0];
	const other = board.placed.find((row) => row.placementId === otherId);
	const title = other?.title ?? `session ${otherId}`;
	const room = other ? (board.rooms.find((row) => row.id === other.roomId)?.name ?? null) : null;
	const time = formatClock(other?.startMinutes ?? null);
	const day = other ? (board.days.find((row) => row.id === other.dayId)?.date ?? null) : null;
	const where = [room ? `in ${room}` : null, time ? `at ${time}` : null, day ? `on ${day}` : null]
		.filter(Boolean)
		.join(' ');

	if (clash.kind === 'speaker') {
		const speaker = ours.speakers.find((name) => other?.speakers.includes(name)) ?? 'A speaker';
		return (
			`Cannot place "${ours.title}" — ${speaker} is already speaking in "${title}"` +
			(where ? ` ${where}` : '') +
			'.'
		);
	}
	return `Cannot place "${ours.title}" — "${title}" is already ` + (where || 'in that room') + '.';
}

function placeInputSchema() {
	return {
		conferenceSlug: slugField,
		placementId: placementField,
		day: z.string().optional().describe('Conference day as YYYY-MM-DD. Prefer this over dayId.'),
		dayId: z
			.number()
			.int()
			.optional()
			.describe('Day id from get_agenda_tray. Omit if you pass day.'),
		roomId: z.number().int().describe('Room id from list_rooms.'),
		start: z.string().optional().describe('Start time as HH:MM (conference clock, e.g. 09:00).'),
		startMinutes: z
			.number()
			.int()
			.optional()
			.describe('Start as minutes from midnight. Omit if you pass start.')
	};
}

function listRooms(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'list_rooms',
		description:
			'List the rooms of a conference you organize, in column order. ' +
			'Rooms are a name and a position — this product does not store a seat count. ' +
			'Use the ids with place_talk and move_talk.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const board = await agendaBoard(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				count: board.rooms.length,
				rooms: board.rooms.map((room) => ({
					id: room.id,
					name: room.name,
					position: room.position
				})),
				days: board.days.map((day) => ({ id: day.id, date: day.date, position: day.position }))
			};
		}
	};
}

function createRoom(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_room',
		description:
			'Add one room to a conference you organize. Same function as Settings → Rooms ' +
			'(`addRoom`). A duplicate name is refused. Rooms have no capacity field.',
		inputSchema: {
			conferenceSlug: slugField,
			name: z.string().min(1).describe('Room name, e.g. Main Stage.')
		},
		handler: async ({ conferenceSlug, name }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const trimmed = name.trim();
			if (!trimmed) {
				throw new McpToolError('Give the room a name.');
			}
			const before = await agendaBoard(conference.id);
			const existing = before.rooms.find(
				(room) => room.name.toLowerCase() === trimmed.toLowerCase()
			);
			if (existing) {
				throw new McpToolError(`A room named "${existing.name}" already exists.`);
			}
			const id = await addRoom(conference.id, trimmed);
			if (id === null) {
				throw new McpToolError('Could not create the room.');
			}
			const after = await agendaBoard(conference.id);
			const room = after.rooms.find((row) => row.id === id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				room: { id, name: room?.name ?? trimmed, position: room?.position ?? null }
			};
		}
	};
}

function getAgendaTray(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'get_agenda_tray',
		description:
			'List accepted talks that are not yet on the grid, plus the days and rooms ' +
			'you can place them on. Same tray `agendaBoard` shows on /agenda. ' +
			'Call place_talk with a placementId from here.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const board = await agendaBoard(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				days: board.days.map((day) => ({ id: day.id, date: day.date, position: day.position })),
				rooms: board.rooms.map((room) => ({
					id: room.id,
					name: room.name,
					position: room.position
				})),
				count: board.tray.length,
				tray: board.tray.map((session) => slotView(session, board))
			};
		}
	};
}

async function placeOrMove(
	ctx: McpContext,
	args: {
		conferenceSlug: string;
		placementId: number;
		day?: string;
		dayId?: number;
		roomId: number;
		start?: string;
		startMinutes?: number;
	}
) {
	const conference = await organizerConference(args.conferenceSlug, ctx);
	const before = await agendaBoard(conference.id);
	const session = findSession(before, args.placementId);
	if (!before.rooms.some((room) => room.id === args.roomId)) {
		throw new McpToolError(`No room ${args.roomId} on this conference. Call list_rooms.`);
	}
	const slot = {
		dayId: resolveDay(before, args.day, args.dayId),
		roomId: args.roomId,
		startMinutes: parseStart(args.start, args.startMinutes)
	};
	const previous = previousSlot(session);

	const result = await placeSession(conference.id, args.placementId, slot);
	if (!result.ok) {
		throw new McpToolError(result.reason);
	}

	const after = await agendaBoard(conference.id);
	const written = findSession(after, args.placementId);
	const clash = colliding(after, [args.placementId]);
	if (clash) {
		await restoreSlot(conference.id, args.placementId, previous);
		throw new McpToolError(collisionMessage(written, clash, after));
	}

	return {
		conference: { slug: conference.slug, name: conference.name },
		slot: slotView(written, after)
	};
}

function placeTalk(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'place_talk',
		description:
			'Put a talk from the tray onto a room and start time. Same write as the ' +
			'agenda builder (`placeSession`). A room or speaker collision is refused ' +
			'with the other talk, room and time named — the builder would let it land.',
		inputSchema: placeInputSchema(),
		handler: async ({ conferenceSlug, placementId, day, dayId, roomId, start, startMinutes }) =>
			placeOrMove(ctx, { conferenceSlug, placementId, day, dayId, roomId, start, startMinutes })
	};
}

function moveTalk(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'move_talk',
		description:
			'Move a placed talk to a different room and/or start. Same write as ' +
			'place_talk (`placeSession`). A collision is refused with the other talk named.',
		inputSchema: placeInputSchema(),
		handler: async ({ conferenceSlug, placementId, day, dayId, roomId, start, startMinutes }) =>
			placeOrMove(ctx, { conferenceSlug, placementId, day, dayId, roomId, start, startMinutes })
	};
}

function swapTalks(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'swap_talks',
		description:
			'Swap the slots of two placed talks. Same function as the agenda builder ' +
			'(`swapPlacements`) — both move or neither does. A collision after the swap ' +
			'is refused with the colliding talk named, and the swap is undone.',
		inputSchema: {
			conferenceSlug: slugField,
			placementId: placementField,
			withPlacementId: z.number().int().describe('The other placed talk to swap with.')
		},
		handler: async ({ conferenceSlug, placementId, withPlacementId }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const result = await swapPlacements(conference.id, placementId, withPlacementId);
			if (!result.ok) {
				throw new McpToolError(result.reason);
			}

			const after = await agendaBoard(conference.id);
			const first = findSession(after, placementId);
			const second = findSession(after, withPlacementId);
			const clash = colliding(after, [placementId, withPlacementId]);
			if (clash) {
				await swapPlacements(conference.id, placementId, withPlacementId);
				const ours = clash.placementIds.includes(placementId) ? first : second;
				throw new McpToolError(collisionMessage(ours, clash, after));
			}

			return {
				conference: { slug: conference.slug, name: conference.name },
				slots: [slotView(first, after), slotView(second, after)]
			};
		}
	};
}

function unplaceTalk(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'unplace_talk',
		description:
			'Take a talk off the grid and back into the tray. Same function as the ' +
			'agenda builder (`unplaceSession`). Status drops to tentative with it.',
		inputSchema: {
			conferenceSlug: slugField,
			placementId: placementField
		},
		handler: async ({ conferenceSlug, placementId }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const before = await agendaBoard(conference.id);
			findSession(before, placementId);
			if (!(await unplaceSession(conference.id, placementId))) {
				throw new McpToolError(
					`No session ${placementId} on this conference. Call get_agenda_tray or get_agenda.`
				);
			}
			const after = await agendaBoard(conference.id);
			return {
				conference: { slug: conference.slug, name: conference.name },
				slot: slotView(findSession(after, placementId), after)
			};
		}
	};
}

export function agendaTools(ctx: McpContext): AnyMcpToolDefinition[] {
	return [
		listRooms(ctx),
		createRoom(ctx),
		getAgendaTray(ctx),
		placeTalk(ctx),
		moveTalk(ctx),
		swapTalks(ctx),
		unplaceTalk(ctx)
	];
}
