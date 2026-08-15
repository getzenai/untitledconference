import { describe, expect, it } from 'vitest';
import { toolInputLines, toolLabel } from './tool-summary';

describe('toolLabel', () => {
	it('turns a tool name into a sentence', () => {
		expect(toolLabel('update_talk_status')).toBe('Update talk status');
	});

	it('leaves an already readable name alone', () => {
		expect(toolLabel('Agenda')).toBe('Agenda');
	});
});

describe('toolInputLines', () => {
	it('names every argument the model filled in', () => {
		expect(toolInputLines({ talk_id: 12, title: 'Goose talk' })).toEqual([
			{ key: 'Talk id', value: '12' },
			{ key: 'Title', value: 'Goose talk' }
		]);
	});

	it('skips empty arguments instead of showing blank rows', () => {
		expect(toolInputLines({ title: 'Keep', note: '', other: null })).toEqual([
			{ key: 'Title', value: 'Keep' }
		]);
	});

	it('cuts a long value so the confirm button stays on screen', () => {
		const [line] = toolInputLines({ abstract: 'x'.repeat(500) });
		expect(line.value).toHaveLength(201);
		expect(line.value.endsWith('…')).toBe(true);
	});

	it('renders a nested argument as json rather than [object Object]', () => {
		expect(toolInputLines({ slot: { day: 1, room: 'A' } })).toEqual([
			{ key: 'Slot', value: '{"day":1,"room":"A"}' }
		]);
	});

	it('has nothing to show for a tool without arguments', () => {
		expect(toolInputLines(undefined)).toEqual([]);
		expect(toolInputLines({})).toEqual([]);
	});
});
