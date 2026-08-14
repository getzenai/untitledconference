/**
 * What an anonymised reviewer is called on the peer surface.
 *
 * The organizer surface no longer renames anyone (#416) — these labels exist for
 * peers seeing each other, where the name really is withheld.
 */
import { describe, expect, it } from 'vitest';
import { peerDisplayLabels } from './anonymous-reviewers';

describe('peerDisplayLabels', () => {
	it('numbers every peer, not only anonymised ones', () => {
		const labels = peerDisplayLabels([{ id: 10 }, { id: 3 }, { id: 10 }]);
		expect([...labels.entries()]).toEqual([
			[3, 'Reviewer 1'],
			[10, 'Reviewer 2']
		]);
	});

	it('is stable under shuffle', () => {
		const a = peerDisplayLabels([{ id: 5 }, { id: 2 }, { id: 9 }]);
		const b = peerDisplayLabels([{ id: 9 }, { id: 5 }, { id: 2 }]);
		expect(a.get(2)).toBe('Reviewer 1');
		expect(b.get(2)).toBe('Reviewer 1');
		expect(a.get(9)).toBe('Reviewer 3');
		expect(b.get(9)).toBe('Reviewer 3');
	});

	it('numbers from one and never leaks a row id', () => {
		const labels = peerDisplayLabels([{ id: 286 }, { id: 41 }]);
		expect([...labels.values()]).toEqual(['Reviewer 1', 'Reviewer 2']);
		expect(labels.get(41)).toBe('Reviewer 1');
	});
});
