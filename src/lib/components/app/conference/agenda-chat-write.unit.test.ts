import { describe, expect, it } from 'vitest';
import {
	describeAgendaWrite,
	isAgendaWriteTool,
	previewAgendaWrite,
	type BoardNames
} from './agenda-chat-write';

const names: BoardNames = {
	talk: (id) => (id === 7 ? 'Observability for agents' : id === 9 ? 'Rust at the edge' : undefined),
	room: (id) => (id === 3 ? 'Main Hall' : undefined),
	day: (id) => (id === 5 ? '2026-09-03' : undefined)
};

describe('agenda chat write copy (#302)', () => {
	it('names talk, room and time before they confirm', () => {
		expect(
			previewAgendaWrite('place_talk', { placementId: 7, roomId: 3, start: '09:00' }, names)
		).toBe('This will place Observability for agents in Main Hall at 09:00.');
	});

	it('reads startMinutes as a clock time', () => {
		expect(
			previewAgendaWrite('move_talk', { placementId: 7, roomId: 3, startMinutes: 555 }, names)
		).toBe('This will move Observability for agents to Main Hall at 09:15.');
	});

	it('says the day only when it is not the one on screen', () => {
		const input = { placementId: 7, roomId: 3, start: '14:00', day: '2026-09-03' };
		expect(previewAgendaWrite('move_talk', input, names, '2026-09-03')).toBe(
			'This will move Observability for agents to Main Hall at 14:00.'
		);
		expect(previewAgendaWrite('move_talk', input, names, '2026-09-02')).toBe(
			'This will move Observability for agents to Main Hall at 14:00 on 2026-09-03.'
		);
	});

	it('resolves a dayId through the board', () => {
		expect(
			previewAgendaWrite(
				'move_talk',
				{ placementId: 7, roomId: 3, start: '14:00', dayId: 5 },
				names,
				'2026-09-02'
			)
		).toBe('This will move Observability for agents to Main Hall at 14:00 on 2026-09-03.');
	});

	it('names both talks in a swap', () => {
		expect(previewAgendaWrite('swap_talks', { placementId: 7, withPlacementId: 9 }, names)).toBe(
			'This will swap Observability for agents with Rust at the edge.'
		);
	});

	it('says where an unplaced talk goes', () => {
		expect(previewAgendaWrite('unplace_talk', { placementId: 9 }, names)).toBe(
			'This will take Rust at the edge off the grid, back into the tray.'
		);
	});

	it('prints an id it cannot name rather than hiding it', () => {
		expect(previewAgendaWrite('place_talk', { placementId: 41, roomId: 8 }, names)).toBe(
			'This will place talk 41 in room 8.'
		);
		expect(previewAgendaWrite('place_talk', {}, names)).toBe(
			'This will place a talk in the slot it named.'
		);
	});

	it('names the change after a confirmed write', () => {
		expect(
			describeAgendaWrite('place_talk', { placementId: 7, roomId: 3, start: '09:00' }, names)
		).toBe('Placed Observability for agents in Main Hall at 09:00');
		expect(describeAgendaWrite('unplace_talk', { placementId: 9 }, names)).toBe(
			'Took Rust at the edge back to the tray'
		);
		expect(describeAgendaWrite('swap_talks', { placementId: 7, withPlacementId: 9 }, names)).toBe(
			'Swapped Observability for agents with Rust at the edge'
		);
	});

	it('knows which tool names are writes', () => {
		expect(isAgendaWriteTool('move_talk')).toBe(true);
		expect(isAgendaWriteTool('get_agenda')).toBe(false);
	});
});
