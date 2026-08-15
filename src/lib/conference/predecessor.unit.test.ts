import { describe, expect, it } from 'vitest';
import {
	editionOptions,
	namedPredecessor,
	predecessorLine,
	predecessorWouldCycle
} from './predecessor';

describe('predecessorWouldCycle', () => {
	it('refuses a conference that points at itself', () => {
		expect(predecessorWouldCycle(1, 1, new Map())).toBe(true);
	});

	it('refuses a two-step loop', () => {
		// 2 already follows 1; pointing 1 at 2 would close the circle.
		expect(predecessorWouldCycle(1, 2, new Map([[2, 1]]))).toBe(true);
	});

	it('allows a new edition to name an existing one', () => {
		expect(
			predecessorWouldCycle(
				3,
				2,
				new Map([
					[2, 1],
					[1, null]
				])
			)
		).toBe(false);
	});

	it('refuses a longer loop', () => {
		// 3 → 2 → 1; pointing 1 at 3 would close the circle.
		expect(
			predecessorWouldCycle(
				1,
				3,
				new Map([
					[3, 2],
					[2, 1]
				])
			)
		).toBe(true);
	});

	it('allows walking a longer chain that does not return', () => {
		expect(
			predecessorWouldCycle(
				4,
				3,
				new Map([
					[3, 2],
					[2, 1],
					[1, null]
				])
			)
		).toBe(false);
	});
});

describe('predecessorLine', () => {
	it('names the previous edition in one sentence', () => {
		expect(predecessorLine('DevFlow 2027')).toBe('Follows DevFlow 2027');
	});
});

const edition = (id: number, name: string, organizationId = 'org-a') => ({
	id,
	name,
	slug: name.toLowerCase().replace(/\s+/g, '-'),
	organizationId
});

describe('editionOptions', () => {
	it('offers only the other editions already on the authorized list', () => {
		const current = edition(1, 'DevFlow 2028');
		const previous = edition(2, 'DevFlow 2027');
		const otherOrg = edition(3, 'Elsewhere 2028', 'org-b');

		expect(editionOptions([current, previous, otherOrg], current)).toEqual([
			{ id: 2, name: 'DevFlow 2027', slug: 'devflow-2027' }
		]);
	});

	it('is empty when the caller only organizes this one conference', () => {
		const current = edition(1, 'DevFlow 2028');
		expect(editionOptions([current], current)).toEqual([]);
	});
});

describe('namedPredecessor', () => {
	it('names a predecessor that is on the authorized list', () => {
		const previous = edition(2, 'DevFlow 2027');
		expect(namedPredecessor([previous], 2)).toEqual({
			id: 2,
			name: 'DevFlow 2027',
			slug: 'devflow-2027'
		});
	});

	it('does not name a predecessor the caller does not organize', () => {
		expect(namedPredecessor([edition(1, 'DevFlow 2028')], 99)).toBeNull();
	});
});
