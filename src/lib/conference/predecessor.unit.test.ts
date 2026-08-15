import { describe, expect, it } from 'vitest';
import { predecessorLine, predecessorWouldCycle } from './predecessor';

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
