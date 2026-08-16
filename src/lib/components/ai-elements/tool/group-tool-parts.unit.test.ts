import { describe, expect, it } from 'vitest';
import {
	groupMessageParts,
	toolGroupSplit,
	toolGroupSummary,
	type GenericPart
} from './group-tool-parts';

function textPart(text: string): GenericPart {
	return { type: 'text', text };
}

function toolPart(name: string, state = 'output-available' as const): GenericPart {
	return { type: `tool-${name}`, state, input: { conferenceSlug: 'devflow' } };
}

describe('groupMessageParts', () => {
	it('returns nothing for an empty turn', () => {
		expect(groupMessageParts([])).toEqual([]);
	});

	it('keeps non-tool parts as singles', () => {
		const segments = groupMessageParts([textPart('hello'), textPart('world')]);
		expect(segments).toHaveLength(2);
		expect(segments.every((segment) => segment.kind === 'single')).toBe(true);
	});

	it('groups consecutive tool parts into one run', () => {
		const segments = groupMessageParts([
			toolPart('list_rooms'),
			toolPart('list_tracks'),
			toolPart('get_agenda')
		]);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({ kind: 'tool-group', startIndex: 0 });
		if (segments[0].kind === 'tool-group') expect(segments[0].parts).toHaveLength(3);
	});

	it('does not let empty text or step-start split a run', () => {
		const segments = groupMessageParts([
			toolPart('list_rooms'),
			{ type: 'step-start' },
			{ type: 'text', text: '   ' },
			toolPart('list_tracks')
		]);
		expect(segments).toHaveLength(1);
		if (segments[0].kind === 'tool-group') expect(segments[0].parts).toHaveLength(2);
	});

	it('starts a new run after visible text', () => {
		const segments = groupMessageParts([
			toolPart('list_rooms'),
			textPart('here they are'),
			toolPart('list_tracks')
		]);
		expect(segments.map((segment) => segment.kind)).toEqual(['tool-group', 'single', 'tool-group']);
	});

	it('leaves an approval card as its own segment so it cannot fold', () => {
		const segments = groupMessageParts([
			toolPart('list_rooms'),
			{
				type: 'tool-update_conference',
				state: 'approval-requested',
				input: { name: 'New' }
			},
			toolPart('list_tracks')
		]);
		expect(segments.map((segment) => segment.kind)).toEqual(['tool-group', 'single', 'tool-group']);
		if (segments[1].kind === 'single') {
			expect(segments[1].part.state).toBe('approval-requested');
		}
	});
});

describe('toolGroupSplit', () => {
	it('folds the whole run once nothing is in flight', () => {
		expect(toolGroupSplit(3, false)).toBe(3);
		expect(toolGroupSplit(1, false)).toBe(0);
	});

	it('keeps the last two lines open while work is in flight', () => {
		expect(toolGroupSplit(5, true)).toBe(3);
		expect(toolGroupSplit(3, true)).toBe(0);
	});
});

describe('toolGroupSummary', () => {
	it('names a hidden error the same way the fold names the count', () => {
		expect(
			toolGroupSummary([
				{ state: 'output-available' },
				{ state: 'output-error' },
				{ state: 'output-available' }
			])
		).toBe('Used 3 tools (1 error)');
	});

	it('names a hidden denial so a refused write is not swallowed', () => {
		expect(
			toolGroupSummary([
				{ state: 'output-available' },
				{ state: 'output-available' },
				{ state: 'output-denied' }
			])
		).toBe('Used 3 tools (1 not done)');
	});

	it('keeps both notes when the fold hides an error and a denial', () => {
		expect(
			toolGroupSummary([
				{ state: 'output-error' },
				{ state: 'output-denied' },
				{ state: 'output-available' }
			])
		).toBe('Used 3 tools (1 error, 1 not done)');
	});
});
