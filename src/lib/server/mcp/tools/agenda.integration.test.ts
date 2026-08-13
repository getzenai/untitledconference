/**
 * Agenda tools, measured against the isolated harness tenant and against
 * agendaBoard — the same board the /agenda screen reads — not against the
 * columns a tool might have written.
 */
import { agendaBoard } from '$lib/server/conference/agenda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { McpContext } from '../context';
import { seedMcpHarness, wipeMcpHarness, type SeededHarness } from '../harness';
import { registerAllTools } from '../server';

const suffix = `mcpagenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = '2027-10-06';

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
function toolsFor(ctx: McpContext): Map<string, Handler> {
	const handlers = new Map<string, Handler>();
	registerAllTools(
		{
			registerTool(name: string, _config: unknown, callback: Handler) {
				handlers.set(name, callback);
			}
		} as never,
		ctx
	);
	return handlers;
}

async function call(ctx: McpContext, name: string, args: Record<string, unknown> = {}) {
	const handler = toolsFor(ctx).get(name);
	if (!handler) throw new Error(`tool ${name} was not registered`);
	const result = (await handler(args)) as unknown as {
		isError?: boolean;
		content: { text: string }[];
	};
	return {
		isError: result.isError ?? false,
		text: result.content[0].text,
		data: result.isError ? null : JSON.parse(result.content[0].text)
	};
}

type Slot = {
	placementId: number;
	title: string;
	room: string | null;
	start: string | null;
	day: string | null;
};

let seeded: SeededHarness;
let organizer: McpContext;
let casey: McpContext;
let drew: McpContext;
let mainStageId: number;
let workshopId: number;
let alpha: Slot;
let beta: Slot;
let gamma: Slot;

beforeAll(async () => {
	seeded = await seedMcpHarness(suffix);
	organizer = { userId: seeded.organizerId, organizationId: seeded.orgId };
	casey = { userId: seeded.speakerIds[0], organizationId: seeded.orgId };
	drew = { userId: seeded.speakerIds[1], organizationId: seeded.orgId };
});

afterAll(async () => {
	await wipeMcpHarness(seeded);
});

describe('agenda tools', () => {
	it('registers every tool the issue names', () => {
		const names = [...toolsFor(organizer).keys()];
		expect(names).toEqual(
			expect.arrayContaining([
				'list_rooms',
				'create_room',
				'get_agenda_tray',
				'place_talk',
				'move_talk',
				'swap_talks',
				'unplace_talk'
			])
		);
	});

	it('refuses a speaker who is only a member of the organization', async () => {
		const result = await call(casey, 'list_rooms', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain('that you organize');
	});

	it('creates rooms through addRoom — the same list agendaBoard shows', async () => {
		const main = await call(organizer, 'create_room', {
			conferenceSlug: seeded.conferenceSlug,
			name: 'Main Stage'
		});
		expect(main.isError).toBe(false);
		mainStageId = main.data!.room.id as number;

		const workshop = await call(organizer, 'create_room', {
			conferenceSlug: seeded.conferenceSlug,
			name: 'Workshop Lab'
		});
		expect(workshop.isError).toBe(false);
		workshopId = workshop.data!.room.id as number;

		const listed = await call(organizer, 'list_rooms', {
			conferenceSlug: seeded.conferenceSlug
		});
		const names = (listed.data!.rooms as { name: string }[]).map((row) => row.name);
		expect(names).toEqual(['Main Stage', 'Workshop Lab']);

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.rooms.map((row) => row.name)).toEqual(['Main Stage', 'Workshop Lab']);

		const again = await call(organizer, 'create_room', {
			conferenceSlug: seeded.conferenceSlug,
			name: 'main stage'
		});
		expect(again.isError).toBe(true);
		expect(again.text).toContain('already exists');
	});

	it('shows accepted talks in the tray the board would show, and nowhere on the grid', async () => {
		await call(organizer, 'open_cfp', { conferenceSlug: seeded.conferenceSlug });
		await call(organizer, 'publish_conference', { conferenceSlug: seeded.conferenceSlug });

		const alphaTalk = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Alpha',
			abstract: 'Casey first.'
		});
		const betaTalk = await call(casey, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Beta',
			abstract: 'Casey second.'
		});
		const gammaTalk = await call(drew, 'submit_proposal', {
			conferenceSlug: seeded.conferenceSlug,
			title: 'Gamma',
			abstract: 'Drew only.'
		});
		expect(alphaTalk.isError).toBe(false);
		expect(betaTalk.isError).toBe(false);
		expect(gammaTalk.isError).toBe(false);

		const decided = await call(organizer, 'decide_submissions', {
			conferenceSlug: seeded.conferenceSlug,
			submissionIds: [
				alphaTalk.data!.submissionId,
				betaTalk.data!.submissionId,
				gammaTalk.data!.submissionId
			],
			decision: 'accepted'
		});
		expect(decided.isError).toBe(false);
		expect(decided.data!.decided).toBe(3);

		const tray = await call(organizer, 'get_agenda_tray', {
			conferenceSlug: seeded.conferenceSlug
		});
		expect(tray.isError).toBe(false);
		const items = tray.data!.tray as Slot[];
		expect(items.map((row) => row.title).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.placed).toHaveLength(0);
		expect(board.tray.map((row) => row.title).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);

		alpha = items.find((row) => row.title === 'Alpha')!;
		beta = items.find((row) => row.title === 'Beta')!;
		gamma = items.find((row) => row.title === 'Gamma')!;
	});

	it('places a talk through placeSession — the board shows the slot, the tray does not', async () => {
		const placed = await call(organizer, 'place_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: alpha.placementId,
			day: DAY,
			roomId: mainStageId,
			start: '09:00'
		});
		expect(placed.isError).toBe(false);
		expect(placed.data!.slot).toMatchObject({
			title: 'Alpha',
			room: 'Main Stage',
			start: '09:00',
			day: DAY
		});

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.placed.find((row) => row.title === 'Alpha')?.startMinutes).toBe(9 * 60);
		expect(board.tray.map((row) => row.title)).not.toContain('Alpha');
	});

	it('refuses a room collision by naming the other talk, room and time, and leaves the board clean', async () => {
		const clash = await call(organizer, 'place_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: gamma.placementId,
			day: DAY,
			roomId: mainStageId,
			start: '09:00'
		});
		expect(clash.isError).toBe(true);
		expect(clash.text).toContain('Alpha');
		expect(clash.text).toContain('Main Stage');
		expect(clash.text).toContain('09:00');

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.conflicts).toEqual([]);
		expect(board.placed.map((row) => row.title)).toEqual(['Alpha']);
		expect(board.tray.map((row) => row.title).sort()).toEqual(['Beta', 'Gamma']);
	});

	it('refuses a speaker collision by naming the other talk Casey is already in', async () => {
		const clash = await call(organizer, 'place_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: beta.placementId,
			day: DAY,
			roomId: workshopId,
			start: '09:00'
		});
		expect(clash.isError).toBe(true);
		expect(clash.text).toContain('Casey Okonkwo');
		expect(clash.text).toContain('Alpha');
		expect(clash.text).toContain('Main Stage');
		expect(clash.text).toContain('09:00');

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.conflicts).toEqual([]);
		expect(board.tray.map((row) => row.title)).toContain('Beta');
	});

	it('places the second Casey talk once the time is free, then moves and swaps through the screen functions', async () => {
		const placed = await call(organizer, 'place_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: beta.placementId,
			day: DAY,
			roomId: workshopId,
			start: '10:00'
		});
		expect(placed.isError).toBe(false);
		expect(placed.data!.slot).toMatchObject({
			title: 'Beta',
			room: 'Workshop Lab',
			start: '10:00'
		});

		const moved = await call(organizer, 'move_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: beta.placementId,
			day: DAY,
			roomId: workshopId,
			start: '11:00'
		});
		expect(moved.isError).toBe(false);
		expect(moved.data!.slot).toMatchObject({ start: '11:00', room: 'Workshop Lab' });

		const swapped = await call(organizer, 'swap_talks', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: alpha.placementId,
			withPlacementId: beta.placementId
		});
		expect(swapped.isError).toBe(false);

		const board = await agendaBoard(seeded.conferenceId);
		const alphaSlot = board.placed.find((row) => row.title === 'Alpha');
		const betaSlot = board.placed.find((row) => row.title === 'Beta');
		expect(alphaSlot?.startMinutes).toBe(11 * 60);
		expect(alphaSlot?.roomId).toBe(workshopId);
		expect(betaSlot?.startMinutes).toBe(9 * 60);
		expect(betaSlot?.roomId).toBe(mainStageId);
		expect(board.conflicts).toEqual([]);
	});

	it('returns a talk to the tray through unplaceSession', async () => {
		const pulled = await call(organizer, 'unplace_talk', {
			conferenceSlug: seeded.conferenceSlug,
			placementId: beta.placementId
		});
		expect(pulled.isError).toBe(false);
		expect(pulled.data!.slot).toMatchObject({
			title: 'Beta',
			room: null,
			start: null
		});

		const board = await agendaBoard(seeded.conferenceId);
		expect(board.placed.map((row) => row.title)).toEqual(['Alpha']);
		expect(board.tray.map((row) => row.title).sort()).toEqual(['Beta', 'Gamma']);
	});
});
