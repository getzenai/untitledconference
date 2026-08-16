/**
 * Agenda tools (#300). Each one calls the same function the screen calls —
 * agendaBoard, addRoom, placeSession, unplaceSession, swapPlacements.
 *
 * One intentional deviation from the screen lives in refuseCollision below:
 * the builder lets clashes land (AIA-05); an agent gets the refusal instead.
 */
import { MISSING_STRUCTURE_NAME } from '$lib/conference/structure-lines';
import {
	addRoom,
	agendaBoard,
	autoPlace,
	createBlock,
	placeSession,
	removeBlock,
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

export function formatClock(minutes: number | null): string | null {
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

	if (clash.kind === 'break') {
		// The break is the other half of the pair whichever way round the query
		// found them, and naming it is the whole message: "you are scheduling
		// through lunch" is not something a room name would convey.
		const blocking = board.placed.find((row) => row.placementId === otherId);
		const when = formatClock(blocking?.startMinutes ?? null);
		return (
			`Cannot place "${ours.title}" — "${blocking?.title ?? 'a break'}" covers every room` +
			(when ? ` at ${when}` : '') +
			'.'
		);
	}

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

/**
 * The refusal for a break laid over a talk, rather than a talk laid over a break.
 * Its own wording because the roles are reversed: what the organizer needs named
 * is the talk that is in the way, and "Cannot place" would be about the wrong one
 * of the two.
 */
function blockCollisionMessage(
	title: string,
	clash: Conflict,
	board: AgendaBoard,
	ourId: number
): string {
	const otherId = clash.placementIds.find((id) => id !== ourId) ?? clash.placementIds[0];
	const other = board.placed.find((row) => row.placementId === otherId);
	const room = other ? (board.rooms.find((row) => row.id === other.roomId)?.name ?? null) : null;
	const time = formatClock(other?.startMinutes ?? null);
	const where = [room ? `in ${room}` : null, time ? `at ${time}` : null].filter(Boolean).join(' ');
	return (
		`Cannot put "${title}" there — "${other?.title ?? `session ${otherId}`}" is already ` +
		(where || 'in that slot') +
		'. Move the talk first, or use unplace_talk.'
	);
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
		writes: false,
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
		writes: true,
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
				throw new McpToolError(MISSING_STRUCTURE_NAME.room);
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
		writes: false,
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
		writes: true,
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
		writes: true,
		description:
			'Move a placed talk to a different room and/or start. Same write as ' +
			'place_talk (`placeSession`). A collision is refused with the other talk named.',
		inputSchema: placeInputSchema(),
		handler: async ({ conferenceSlug, placementId, day, dayId, roomId, start, startMinutes }) =>
			placeOrMove(ctx, { conferenceSlug, placementId, day, dayId, roomId, start, startMinutes })
	};
}

function fillSchedule(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'fill_schedule',
		writes: true,
		description:
			'Fill accepted talks from the tray into the first free clash-free slots. ' +
			'Same function as the agenda Fill button (`autoPlace`) — longest first, ' +
			'earliest slot. Returns how many talks moved, the same number the button ' +
			'reports as autoPlaced. Talks the packer cannot fit stay in the tray; ' +
			'read them with get_agenda_tray. That leftover is not an error.',
		inputSchema: { conferenceSlug: slugField },
		handler: async ({ conferenceSlug }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			return {
				conference: { slug: conference.slug, name: conference.name },
				autoPlaced: await autoPlace(conference.id)
			};
		}
	};
}

function swapTalks(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'swap_talks',
		writes: true,
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
		writes: true,
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

function createBreak(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'create_break',
		writes: true,
		description:
			'Put a break or a reserved block on the grid — lunch, coffee, registration, ' +
			'a room held for a sponsor. Omit roomId and it covers every room, which is ' +
			'what a lunch break usually is; give one and it occupies that room alone. ' +
			'Unlike a talk, it carries its own length: minutes is required, because a ' +
			'break has no session format to take one from. Once it is there the ' +
			'collision rules treat it like any other occupant — place_talk refuses a ' +
			'talk that would run through it. There is no screen for this; the agenda ' +
			'builder can only move talks.',
		inputSchema: {
			conferenceSlug: slugField,
			day: z.string().optional().describe('Conference day as YYYY-MM-DD. Prefer this over dayId.'),
			dayId: z.number().int().optional().describe('Day id from get_agenda_tray.'),
			roomId: z
				.number()
				.int()
				.optional()
				.describe('Room id from list_rooms. Omit for a break across every room.'),
			start: z.string().optional().describe('Start time as HH:MM (conference clock, e.g. 12:30).'),
			startMinutes: z.number().int().optional().describe('Start as minutes from midnight.'),
			minutes: z.number().int().describe('How long it lasts, in minutes.'),
			title: z.string().min(1).describe('What it is called, e.g. Lunch.'),
			kind: z
				.enum(['break', 'reservation'])
				.optional()
				.describe(
					'break (the default) is time nobody is speaking; reservation is a slot held for ' +
						'something not in the programme yet, e.g. a sponsor.'
				)
		},
		handler: async (args) => {
			const conference = await organizerConference(args.conferenceSlug, ctx);
			const board = await agendaBoard(conference.id);
			const dayId = resolveDay(board, args.day, args.dayId);
			const startMinutes = parseStart(args.start, args.startMinutes);

			if (args.roomId !== undefined && !board.rooms.some((room) => room.id === args.roomId)) {
				throw new McpToolError(`No room ${args.roomId} on this conference. Call list_rooms.`);
			}

			const result = await createBlock(conference.id, {
				dayId,
				roomId: args.roomId ?? null,
				startMinutes,
				minutes: args.minutes,
				title: args.title,
				// `block` is the schema's word for it, `break` is the organizer's. The
				// tool speaks the organizer's; the translation belongs here and not in
				// their head.
				kind: args.kind === 'reservation' ? 'reservation' : 'block'
			});
			if (!result.ok) {
				throw new McpToolError(result.reason);
			}

			// The same refusal place_talk gives, from the other side. A break laid over
			// a talk is the identical mistake as a talk laid over a break — only the
			// order of the two writes differs, and an agent that could do it one way
			// round would have found the hole in the guard immediately.
			const after = await agendaBoard(conference.id);
			const clash = colliding(after, [result.placementId]);
			if (clash) {
				await removeBlock(conference.id, result.placementId);
				throw new McpToolError(
					blockCollisionMessage(args.title.trim(), clash, after, result.placementId)
				);
			}

			return {
				conference: { slug: conference.slug, name: conference.name },
				created: true,
				slot: slotView(findSession(after, result.placementId), after)
			};
		}
	};
}

function removeBreak(ctx: McpContext): AnyMcpToolDefinition {
	return {
		name: 'remove_break',
		writes: true,
		description:
			'Delete a break or reserved block from the grid, by the placementId get_agenda ' +
			'reports for it. A talk is refused — use unplace_talk, which returns it to the ' +
			'tray instead of erasing the placement.',
		inputSchema: {
			conferenceSlug: slugField,
			placementId: z.number().int().describe('Placement id of the break, from get_agenda.')
		},
		handler: async ({ conferenceSlug, placementId }) => {
			const conference = await organizerConference(conferenceSlug, ctx);
			const before = await agendaBoard(conference.id);
			const existing = findSession(before, placementId);
			if (existing.kind === 'session') {
				throw new McpToolError(
					`Placement ${placementId} is the talk "${existing.title}", not a break. ` +
						'Use unplace_talk to take it off the grid.'
				);
			}
			if (!(await removeBlock(conference.id, placementId))) {
				throw new McpToolError(`No break ${placementId} on this conference. Call get_agenda.`);
			}
			return {
				conference: { slug: conference.slug, name: conference.name },
				removed: { placementId, title: existing.title, kind: existing.kind }
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
		fillSchedule(ctx),
		swapTalks(ctx),
		unplaceTalk(ctx),
		createBreak(ctx),
		removeBreak(ctx)
	];
}
