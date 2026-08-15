/**
 * What an agenda write will do, and what it did.
 *
 * The four tools take ids — `placementId`, `roomId`, `dayId` — and the
 * organizer is looking at names. The board the page already loaded is the
 * only place those names exist, so the panel hands in a lookup and this file
 * turns a tool call into a sentence somebody can say yes to (#302).
 *
 * An id that the lookup does not know is printed as an id rather than
 * swallowed: a confirmation that hides what it cannot name is worse than one
 * that admits it.
 */
import { chatWriteError } from './chat-write-error';

export type AgendaWriteTool = 'place_talk' | 'move_talk' | 'swap_talks' | 'unplace_talk';

export type AgendaWriteInput = {
	placementId?: number;
	withPlacementId?: number;
	roomId?: number;
	day?: string;
	dayId?: number;
	start?: string;
	startMinutes?: number;
};

/** Names off the loaded board. Each returns undefined for an id it does not hold. */
export type BoardNames = {
	talk: (placementId: number) => string | undefined;
	room: (roomId: number) => string | undefined;
	day: (dayId: number) => string | undefined;
};

function talkName(names: BoardNames, placementId?: number): string {
	if (placementId == null) return 'a talk';
	return names.talk(placementId)?.trim() || `talk ${placementId}`;
}

function roomName(names: BoardNames, roomId?: number): string | null {
	if (roomId == null) return null;
	return names.room(roomId)?.trim() || `room ${roomId}`;
}

function clock(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The time the call asks for, however it was expressed. */
function startName(input: AgendaWriteInput): string | null {
	if (typeof input.start === 'string' && input.start.trim() !== '') return input.start.trim();
	if (typeof input.startMinutes === 'number' && Number.isFinite(input.startMinutes)) {
		return clock(input.startMinutes);
	}
	return null;
}

/**
 * The day, only when it is not the one on screen. `day` beats `dayId` for the
 * same reason the tool prefers it: it is already the date the model was given.
 */
function dayName(names: BoardNames, input: AgendaWriteInput, openDay?: string): string | null {
	if (typeof input.day === 'string' && input.day.trim() !== '') {
		const day = input.day.trim();
		return day === openDay?.trim() ? null : day;
	}
	if (input.dayId == null) return null;
	const named = names.day(input.dayId)?.trim();
	if (!named) return `day ${input.dayId}`;
	// The board stores a date, the panel hands in a date: same day, say nothing.
	return named.slice(0, 10) === openDay?.trim().slice(0, 10) ? null : named;
}

/** "Room 1 at 09:00 on 2026-09-02", with whatever parts the call carries. */
function target(names: BoardNames, input: AgendaWriteInput, openDay?: string): string {
	const bits = [
		roomName(names, input.roomId),
		startName(input) ? `at ${startName(input)}` : null,
		dayName(names, input, openDay) ? `on ${dayName(names, input, openDay)}` : null
	].filter(Boolean);
	return bits.length ? bits.join(' ') : 'the slot it named';
}

/** Shown on the confirmation, before anything is written. */
export function previewAgendaWrite(
	tool: AgendaWriteTool,
	input: AgendaWriteInput,
	names: BoardNames,
	openDay?: string
): string {
	const talk = talkName(names, input.placementId);
	switch (tool) {
		case 'place_talk':
			return `This will place ${talk} in ${target(names, input, openDay)}.`;
		case 'move_talk':
			return `This will move ${talk} to ${target(names, input, openDay)}.`;
		case 'swap_talks':
			return `This will swap ${talk} with ${talkName(names, input.withPlacementId)}.`;
		case 'unplace_talk':
			return `This will take ${talk} off the grid, back into the tray.`;
	}
}

/** The history line after a confirmed write. */
export function describeAgendaWrite(
	tool: AgendaWriteTool,
	input: AgendaWriteInput,
	names: BoardNames,
	openDay?: string
): string {
	const talk = talkName(names, input.placementId);
	switch (tool) {
		case 'place_talk':
			return `Placed ${talk} in ${target(names, input, openDay)}`;
		case 'move_talk':
			return `Moved ${talk} to ${target(names, input, openDay)}`;
		case 'swap_talks':
			return `Swapped ${talk} with ${talkName(names, input.withPlacementId)}`;
		case 'unplace_talk':
			return `Took ${talk} back to the tray`;
	}
}

const WRITE_TOOLS = new Set<string>([
	'place_talk',
	'move_talk',
	'swap_talks',
	'unplace_talk'
] satisfies AgendaWriteTool[]);

export function isAgendaWriteTool(name: string): name is AgendaWriteTool {
	return WRITE_TOOLS.has(name);
}

/**
 * A refused write still finishes: `runMcpTool` turns a recognized refusal —
 * a collision, a talk that is not on this board — into `{ error }` and the
 * tool part reaches `output-available` like any success. Reading only the
 * state would paint "Placed X" over a board that did not change, so the
 * panel asks the output what happened (#302).
 */
export function agendaWriteError(output: unknown): string | null {
	return chatWriteError(output);
}
